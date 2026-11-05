"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ARTIFACT_IDS } from "@/components/FlockMiniGame/flockArtifacts";
import { LEGENDARY_SKIN_IDS } from "@/lib/rubies";
import RubyIcon from "@/components/RubyIcon/RubyIcon";
import {
  AdminHttpError,
  adjustAdminMemberRubies,
  adminMemberFlockQueryKey,
  fetchAdminMemberFlock,
  grantAdminMemberArtifact,
  grantAdminMemberSkin,
} from "@/lib/queries/adminQueries";
import { describeRubyTx, type RubyTxI18n } from "@/lib/rubyTransactions";
import styles from "./admin.module.scss";

/** Блок «Рубіни» у картці учасника: баланс, куплені скіни, журнал і ручне нарахування/списання. */
export default function AdminMemberRubies({ memberId }: { memberId: string }) {
  const t = useTranslations("admin.rubies");
  const tf = useTranslations("flock");
  const i18n = {
    t: t as unknown as RubyTxI18n["t"],
    skinName: (id: number) => tf(`skins.${id}`),
    artifactName: (id: number) => tf(`artifacts.items.${id}.name`),
  };
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [grantId, setGrantId] = useState<number>(ARTIFACT_IDS[0]);
  const [skinGrantId, setSkinGrantId] = useState<number>(LEGENDARY_SKIN_IDS[0]);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: adminMemberFlockQueryKey(memberId),
    queryFn: () => fetchAdminMemberFlock(memberId),
    enabled: open,
  });

  const adjust = useMutation({
    mutationFn: ({ delta, why }: { delta: number; why: string }) => adjustAdminMemberRubies(memberId, delta, why),
    onSuccess: async () => {
      setAmount("");
      setReason("");
      setError(null);
      await queryClient.invalidateQueries({ queryKey: adminMemberFlockQueryKey(memberId) });
    },
    onError: (e) => {
      const code = e instanceof AdminHttpError ? e.message : "";
      setError(["reason_required", "invalid_amount", "insufficient_balance", "user_not_found"].includes(code) ? code : "generic");
    },
  });

  const grant = useMutation({
    mutationFn: (artifact: number) => grantAdminMemberArtifact(memberId, artifact),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: adminMemberFlockQueryKey(memberId) });
    },
    onError: (e) => {
      const code = e instanceof AdminHttpError ? e.message : "";
      setError(["already_owned", "invalid_artifact", "user_not_found"].includes(code) ? code : "generic");
    },
  });

  const grantSkin = useMutation({
    mutationFn: (skin: number) => grantAdminMemberSkin(memberId, skin),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: adminMemberFlockQueryKey(memberId) });
    },
    onError: (e) => {
      const code = e instanceof AdminHttpError ? e.message : "";
      setError(["already_owned", "invalid_skin", "user_not_found"].includes(code) ? code : "generic");
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const delta = Number(amount);
    if (!reason.trim()) return setError("reason_required");
    if (!Number.isInteger(delta) || delta === 0) return setError("invalid_amount");
    setError(null);
    adjust.mutate({ delta, why: reason.trim() });
  };

  const data = query.data;
  return (
    <section className={styles.section}>
      <button type="button" className={styles.rubiesToggle} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <RubyIcon size={16} /> {t("title")}
        {data ? <strong>{data.rubies}</strong> : null}
      </button>
      {open ? (
        <div className={styles.rubiesBody}>
          {query.isLoading ? <p className={styles.meta}>{t("loading")}</p> : null}
          {query.isError ? <p className={styles.error}>{t("errors.generic")}</p> : null}
          {data ? (
            <>
              <p className={styles.meta}>
                <strong>{t("balance")}</strong>{" "}
                <span className={styles.rubiesBalance}>
                  <RubyIcon size={14} /> {tf("rubies.count", { count: data.rubies })}
                </span>
                <br />
                <strong>{t("skins")}</strong>{" "}
                {data.ownedSkins.length ? data.ownedSkins.map((id) => tf(`skins.${id}`)).join(", ") : t("noSkins")}
                <br />
                <strong>{t("artifacts")}</strong>{" "}
                {data.ownedArtifacts?.length
                  ? data.ownedArtifacts.map((id) => `${tf(`artifacts.items.${id}.name`)}${id === data.selectedArtifact ? ` (${t("artifactWorn")})` : ""}`).join(", ")
                  : t("noArtifacts")}
              </p>
              <form
                className={styles.rubiesForm}
                onSubmit={(e) => {
                  e.preventDefault();
                  grant.mutate(grantId);
                }}
              >
                <select className={styles.field} value={grantId} onChange={(e) => setGrantId(Number(e.target.value))} aria-label={t("pickArtifact")}>
                  {ARTIFACT_IDS.map((id) => (
                    <option key={id} value={id}>
                      {tf(`artifacts.items.${id}.name`)}
                    </option>
                  ))}
                </select>
                <button type="submit" className={styles.btn} disabled={grant.isPending}>
                  {t("grantBtn")}
                </button>
              </form>
              <form
                className={styles.rubiesForm}
                onSubmit={(e) => {
                  e.preventDefault();
                  grantSkin.mutate(skinGrantId);
                }}
              >
                <select className={styles.field} value={skinGrantId} onChange={(e) => setSkinGrantId(Number(e.target.value))} aria-label={t("pickSkin")}>
                  {LEGENDARY_SKIN_IDS.map((id) => (
                    <option key={id} value={id}>
                      {tf(`skins.${id}`)}
                    </option>
                  ))}
                </select>
                <button type="submit" className={styles.btn} disabled={grantSkin.isPending}>
                  {t("grantSkinBtn")}
                </button>
              </form>
              <form className={styles.rubiesForm} onSubmit={submit}>
                <input
                  type="number"
                  className={`${styles.field} ${styles.fieldNarrow}`}
                  step={1}
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={t("amountPlaceholder")}
                  aria-label={t("amountLabel")}
                />
                <input
                  type="text"
                  className={`${styles.field} ${styles.fieldGrow}`}
                  maxLength={300}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t("reasonPlaceholder")}
                  aria-label={t("reasonLabel")}
                  required
                />
                <button type="submit" className={styles.btn} disabled={adjust.isPending}>
                  {adjust.isPending ? t("applying") : t("apply")}
                </button>
              </form>
              {error ? <p className={styles.error}>{t(`errors.${error}`)}</p> : null}
              <h4 className={styles.rubiesH}>{t("history")}</h4>
              {data.transactions.length === 0 ? (
                <p className={styles.meta}>{t("noHistory")}</p>
              ) : (
                <ul className={styles.rubiesLog}>
                  {data.transactions.map((tx) => {
                    const v = describeRubyTx(tx, i18n);
                    return (
                      <li key={tx.id} title={v.hint ?? undefined}>
                        <span className={tx.delta > 0 ? styles.plus : tx.delta < 0 ? styles.minus : styles.zero}>
                          {tx.delta > 0 ? "+" : ""}
                          {tx.delta}
                        </span>
                        <span className={styles.rubiesTx}>
                          <span>{v.title}</span>
                          {v.note || tx.actorId ? (
                            <small className={styles.rubiesNote}>
                              {v.note}
                              {tx.actorId ? `${v.note ? " · " : ""}${t("by", { id: tx.actorId.slice(0, 8) })}` : ""}
                            </small>
                          ) : null}
                        </span>
                        <time dateTime={tx.createdAt}>
                          <span>{v.date}</span>
                          <small>{t("balanceAfter", { balance: tx.balanceAfter })}</small>
                        </time>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
