import BibleReader from "@/components/BibleReader/BibleReader";

/** Читалка сама займає висоту `main` (flex) — інакше блок із віршами не скролиться, а кнопки глав виходять за екран. */
export default function BiblePage() {
  return <BibleReader />;
}
