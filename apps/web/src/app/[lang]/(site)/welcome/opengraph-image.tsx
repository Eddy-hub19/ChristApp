import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

/**
 * OG-превʼю публічної сторінки Christ App (1200×630): Next підставляє його в `og:image` і `twitter:image`.
 * Генерується на етапі збірки зі статичних ресурсів проєкту, не залежить від сесії й доступне без авторизації.
 */
export const alt = "Christ App — United in Christ";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GREEN = "#5f7d63";
const GREEN_DEEP = "#3f5a44";
const GREEN_SOFT = "#dfe9dc";
const INK = "#1f2a22";
const MUTED = "#5b675e";

async function dataUri(file: string, mime: string): Promise<string> {
  const buf = await readFile(path.join(process.cwd(), "public", file));
  return `data:${mime};base64,${buf.toString("base64")}`;
}

function Bubble({ text, me }: { text: string; me?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignSelf: me ? "flex-end" : "flex-start",
        maxWidth: "86%",
        padding: "10px 14px",
        borderRadius: 18,
        background: me ? GREEN_DEEP : GREEN_SOFT,
        color: me ? "#fff" : INK,
        fontSize: 15,
        lineHeight: 1.35,
      }}
    >
      {text}
    </div>
  );
}

export default async function Image() {
  const [logo, avatar, sheep] = await Promise.all([
    dataUri("icon-192x192.png", "image/png"),
    dataUri("ava-chat.jpeg", "image/jpeg"),
    dataUri("sheep.png", "image/png"),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          backgroundColor: "#f6f7f2",
          backgroundImage:
            "radial-gradient(circle at 85% 0%, rgba(143,177,143,0.4), rgba(246,247,242,0) 55%), radial-gradient(circle at 0% 100%, rgba(223,233,220,0.95), rgba(246,247,242,0) 55%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* Текст */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            width: 640,
            padding: "0 0 0 72px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logo}
              width={56}
              height={56}
              alt=""
              style={{ borderRadius: 14 }}
            />
            <div
              style={{
                display: "flex",
                marginLeft: 16,
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: 4,
                color: GREEN,
                textTransform: "uppercase",
              }}
            >
              Christian community
            </div>
          </div>

          <div
            style={{
              display: "flex",
              marginTop: 28,
              fontSize: 112,
              fontWeight: 700,
              letterSpacing: -4,
              lineHeight: 1,
              color: INK,
            }}
          >
            Christ App
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 14,
              fontSize: 48,
              fontWeight: 700,
              color: GREEN_DEEP,
            }}
          >
            United in Christ
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 26,
              maxWidth: 520,
              fontSize: 25,
              lineHeight: 1.45,
              color: MUTED,
            }}
          >
            A Christian community platform for chat, Bible reading, notes,
            profiles, and meaningful connection.
          </div>
        </div>

        {/* Телефон: чат */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            position: "absolute",
            left: 760,
            top: 70,
            width: 300,
            height: 640,
            padding: "26px 16px 16px",
            borderRadius: 48,
            border: "8px solid #e2e8de",
            background: "#fbfcf9",
            boxShadow: "0 40px 80px rgba(47,74,52,0.28)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              paddingBottom: 14,
              borderBottom: "1px solid rgba(31,42,34,0.1)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={avatar}
              width={40}
              height={40}
              alt=""
              style={{ borderRadius: 20 }}
            />
            <div style={{ display: "flex", flexDirection: "column", marginLeft: 10 }}>
              <div style={{ display: "flex", fontSize: 16, fontWeight: 700, color: INK }}>
                General chat
              </div>
              <div style={{ display: "flex", fontSize: 12, color: GREEN }}>
                Community
              </div>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              marginTop: 18,
            }}
          >
            <Bubble text="Good morning, everyone! Today’s reading is so encouraging." />
            <Bubble text="Amen! Praying for you all this week." />
            <Bubble me text="Thank you. Let’s read it together tonight." />
          </div>
        </div>

        {/* Карточка: Библия */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            position: "absolute",
            left: 950,
            top: 110,
            width: 230,
            padding: "18px 20px",
            borderRadius: 24,
            background: "#ffffff",
            border: "1px solid rgba(31,42,34,0.1)",
            boxShadow: "0 24px 48px rgba(47,74,52,0.22)",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 2,
              color: GREEN,
            }}
          >
            BIBLE
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 8,
              fontSize: 20,
              lineHeight: 1.3,
              fontFamily: "serif",
              color: INK,
            }}
          >
            “For God so loved the world, that he gave his only begotten Son…”
          </div>
          <div style={{ display: "flex", marginTop: 10, fontSize: 14, color: MUTED }}>
            John 3:16
          </div>
        </div>

        {/* Карточка: игры */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            position: "absolute",
            left: 680,
            top: 450,
            width: 290,
            padding: "12px 18px 12px 12px",
            borderRadius: 24,
            background: "#ffffff",
            border: "1px solid rgba(31,42,34,0.1)",
            boxShadow: "0 24px 48px rgba(47,74,52,0.22)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 72,
              height: 72,
              borderRadius: 18,
              background: "linear-gradient(145deg,#b9d4b0,#8fb18f)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sheep} width={58} height={32} alt="" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginLeft: 14 }}>
            <div
              style={{
                display: "flex",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 2,
                color: GREEN,
              }}
            >
              GAMES
            </div>
            <div style={{ display: "flex", fontSize: 20, fontWeight: 700, color: INK }}>
              Play together
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
