"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ARTIFACT_IDS } from "@/components/FlockMiniGame/flockArtifacts";
import RubyIcon from "@/components/RubyIcon/RubyIcon";
import {
  AdminHttpError,
  adjustAdminMemberRubies,
  adminMemberFlockQueryKey,
  fetchAdminMemberFlock,
  grantAdminMemberArtifact,
} from "@/lib/queries/adminQueries";
import styles from "./admin.module.scss";

/** Блок «Рубіни» у картці учасника: баланс, куплені скіни, журнал і ручне нарахування/списання. */
export default function AdminMemberRubies({ memberId }: { memberId: string }) {
  const t = useTranslations("admin.rubies");
  const tf = useTranslations("flock");
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [grantId, setGrantId] = useState<number>(ARTIFACT_IDS[0]);
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
    <div className={styles.rubies}>
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
                <select value={grantId} onChange={(e) => setGrantId(Number(e.target.value))} aria-label={t("pickArtifact")}>
                  {ARTIFACT_IDS.map((id) => (
                    <option key={id} value={id}>
                      {tf(`artifacts.items.${id}.name`)}
                    </option>
                  ))}
                </select>
                <button type="submit" disabled={grant.isPending}>
                  {t("grantBtn")}
                </button>
              </form>
              <form className={styles.rubiesForm} onSubmit={submit}>
                <input
                  type="number"
                  step={1}
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={t("amountPlaceholder")}
                  aria-label={t("amountLabel")}
                />
                <input
                  type="text"
                  maxLength={300}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t("reasonPlaceholder")}
                  aria-label={t("reasonLabel")}
                  required
                />
                <button type="submit" disabled={adjust.isPending}>
                  {adjust.isPending ? t("applying") : t("apply")}
                </button>
              </form>
              {error ? <p className={styles.error}>{t(`errors.${error}`)}</p> : null}
              <h4 className={styles.rubiesH}>{t("history")}</h4>
              {data.transactions.length === 0 ? (
                <p className={styles.meta}>{t("noHistory")}</p>
              ) : (
                <ul className={styles.rubiesLog}>
                  {data.transactions.map((tx) => (
                    <li key={tx.id}>
                      <span className={tx.delta > 0 ? styles.plus : styles.minus}>
                        {tx.delta > 0 ? "+" : ""}
                        {tx.delta}
                      </span>
                      <span>
                        {t(`reasons.${tx.reason}`)}
                        {tx.skinId !== null ? `: ${tf(`skins.${tx.skinId}`)}` : ""}
                        {tx.artifactId ? `: ${tf(`artifacts.items.${tx.artifactId}.name`)}` : ""}
                        {tx.note ? ` — ${tx.note}` : ""}
                        {tx.actorId ? ` (${t("by", { id: tx.actorId.slice(0, 8) })})` : ""}
                      </span>
                      <time dateTime={tx.createdAt}>
                        {new Date(tx.createdAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })} · {tx.balanceAfter}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
