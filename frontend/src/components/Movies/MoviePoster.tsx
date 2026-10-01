import Image from "next/image";
import { Film } from "lucide-react";
import styles from "./Movies.module.scss";

interface Props {
  src: string | null;
  alt: string;
  sizes: string;
  priority?: boolean;
}

/** Постер 2:3 із заглушкою, якщо в TMDB його немає. */
export default function MoviePoster({ src, alt, sizes, priority }: Props) {
  return (
    <span className={styles.poster}>
      {src ? (
        <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className={styles.posterImg} />
      ) : (
        <span className={styles.posterEmpty} aria-hidden>
          <Film size={28} />
        </span>
      )}
    </span>
  );
}
