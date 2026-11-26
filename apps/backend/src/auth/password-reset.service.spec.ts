import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { AuthRateLimiter } from './auth-rate-limiter';
import { PasswordResetService } from './password-reset.service';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');

function setup(record: object | null = null, userExists = true) {
  const tx = {
    passwordResetToken: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    user: { update: jest.fn().mockResolvedValue({}) },
    refreshSession: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
  };
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(userExists ? { id: 'u1' } : null),
    },
    passwordResetToken: {
      findUnique: jest.fn().mockResolvedValue(record),
      deleteMany: jest.fn().mockReturnValue('del'),
      create: jest.fn().mockReturnValue('create'),
    },
    $transaction: jest.fn(async (arg: unknown) =>
      typeof arg === 'function' ? arg(tx) : arg,
    ),
  };
  const service = new PasswordResetService(
    prisma as never,
    new AuthRateLimiter(),
  );
  return { service, prisma, tx };
}

describe('PasswordResetService', () => {
  it('issue: stores only the hash and returns a raw token', async () => {
    const { service, prisma } = setup();
    const { token, expiresAt } = await service.issue('u1', 'admin');
    expect(token.length).toBeGreaterThanOrEqual(40);
    const data = prisma.passwordResetToken.create.mock.calls[0][0].data;
    expect(data.tokenHash).toBe(sha(token));
    expect(data.tokenHash).not.toBe(token);
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('issue: unknown member -> 404', async () => {
    const { service } = setup(null, false);
    await expect(service.issue('nope', 'admin')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it.each([
    ['missing', null],
    [
      'used',
      {
        id: 'r',
        userId: 'u1',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 1e6),
      },
    ],
    [
      'expired',
      {
        id: 'r',
        userId: 'u1',
        usedAt: null,
        expiresAt: new Date(Date.now() - 1),
      },
    ],
  ])('confirm: %s token is rejected', async (_n, record) => {
    const { service, tx } = setup(record);
    await expect(
      service.confirm('t'.repeat(30), 'newpass1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('confirm: sets bcrypt hash, revokes sessions', async () => {
    const { service, tx } = setup({
      id: 'r',
      userId: 'u1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 1e6),
    });
    await expect(service.confirm('t'.repeat(30), 'newpass1')).resolves.toEqual({
      ok: true,
    });
    const hash = tx.user.update.mock.calls[0][0].data.password;
    expect(await bcrypt.compare('newpass1', hash)).toBe(true);
    expect(tx.refreshSession.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
    });
  });

  it('confirm: lost race on the token is rejected', async () => {
    const { service, tx } = setup({
      id: 'r',
      userId: 'u1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 1e6),
    });
    tx.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.confirm('t'.repeat(30), 'newpass1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});
