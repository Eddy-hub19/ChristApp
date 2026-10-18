import BibleReader from "@/components/BibleReader/BibleReader";

type Props = {
  params: Promise<{ book: string }>;
  searchParams?: Promise<{ chapter?: string; verse?: string; verseTo?: string }>;
};

export default async function BookPage({ params, searchParams }: Props) {
  const { book } = await params;
  const sp = searchParams ? await searchParams : {};
  const num = (v?: string) => {
    const n = v ? parseInt(v, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  return (
    <BibleReader
      initialBookId={book}
      initialChapterId={num(sp.chapter)}
      initialVerseId={num(sp.verse)}
      initialVerseTo={num(sp.verseTo)}
    />
  );
}
