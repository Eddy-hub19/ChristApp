/** Інлайняться `next.config.ts` (`env`) під час білда — див. resolveBuildSha() там. */
export const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA || "dev";
export const BUILD_DATE = process.env.NEXT_PUBLIC_BUILD_DATE || "";
