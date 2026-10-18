import { Suspense } from "react";
import BibleHome from "@/components/BibleHome/BibleHome";

export default function BiblePage() {
  return (
    <Suspense fallback={null}>
      <BibleHome />
    </Suspense>
  );
}
