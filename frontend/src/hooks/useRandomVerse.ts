"use client";

import { useCallback, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { fetchRandomVerse } from "@/lib/bibleApi";

export interface RandomVerse {
  book: string;
  chapter: number;
  verse: number | string;
  text: string;
}

/** «Випадковий вірш» — це дія за запитом користувача (щоразу інший результат), тож useMutation, а не кешований useQuery. */
export function useRandomVerse() {
  const t = useTranslations("randomVerse");
  // Попередній вірш лишається на екрані, поки вантажиться наступний (як було до переходу на useMutation).
  const [verse, setVerse] = useState<RandomVerse | null>(null);
  const mutation = useMutation<RandomVerse, Error, string>({
    mutationFn: async (translation) => {
      const randomVerse = await fetchRandomVerse(translation);
      if (!randomVerse) {
        throw new Error(t("fetchFailed"));
      }
      return randomVerse;
    },
    onSuccess: (randomVerse) => setVerse(randomVerse),
    onError: () => setVerse(null),
  });
  const { mutate } = mutation;

  const getRandomVerse = useCallback(
    async (translation: string) => {
      mutate(translation);
    },
    [mutate],
  );

  const error = mutation.error
    ? mutation.error.message || t("unknownError")
    : null;

  return {
    verse,
    isLoading: mutation.isPending,
    error,
    getRandomVerse,
  };
}
