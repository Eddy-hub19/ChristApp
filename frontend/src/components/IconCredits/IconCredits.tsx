import { useTranslations } from "next-intl"

export default function IconCredits() {
  const t = useTranslations("profile.iconCredits")
  return (
    <section>
      <h2>Autor: Ed</h2>
    </section>
  )
}
