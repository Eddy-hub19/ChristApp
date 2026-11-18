import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";

export type LegalSection = {
  heading: string;
  /** Параграфы и маркированные списки идут в порядке массива. */
  blocks: Array<
    | { type: "p"; content: ReactNode }
    | { type: "ul"; items: ReactNode[] }
  >;
};

export type LegalDocument = {
  title: string;
  effectiveDate: string;
  intro: ReactNode;
  sections: LegalSection[];
};

const CONTACT = "sekaneduard@gmail.com";

export const privacyPolicy: LegalDocument = {
  title: "Privacy Policy",
  effectiveDate: "November 11, 2026",
  intro: (
    <>
      This Privacy Policy explains how Christ App handles your information when
      you sign in and use the app. Eduard Sekan is
      responsible for processing your information. You can contact us at{" "}
      {CONTACT}.
    </>
  ),
  sections: [
    {
      heading: "Information we collect and how we use it",
      blocks: [
        {
          type: "ul",
          items: [
            <>
              <strong>Google Sign-In.</strong> When you sign in with Google,
              Christ App receives your Google account ID, email address, name,
              and profile picture, if available. We use your account ID and
              email address to create your Christ App account and sign you in.
              We use your name and profile picture to fill in your profile. We
              store the profile information associated with your account in the
              Christ App database. We do not receive your Google password.
            </>,
            <>
              <strong>Information you add or create.</strong> We process the
              information you add to your profile, the messages you send, and
              the notes you save. In the game Oтара, we process your progress,
              results, and in-game items so they are saved between sessions.
            </>,
            <>
              <strong>Session information.</strong> We use cookies to sign you
              in and keep you signed in.
            </>,
          ],
        },
      ],
    },
    {
      heading: "Who can access your information",
      blocks: [
        {
          type: "p",
          content:
            "Messages are visible to participants in the chat where you send them. Other users can see the profile details and game results displayed in the relevant parts of the app. We may review messages and reports to enforce community rules and respond to user requests.",
        },
        {
          type: "p",
          content:
            "We use Vercel to host the web app, Render to run the server, Neon to host the database, and Cloudinary to store uploaded images to process app data, including profile information received from Google. We may also disclose information when required by law.",
        },
      ],
    },
    {
      heading: "Data retention and deletion",
      blocks: [
        {
          type: "p",
          content:
            "We keep your account data for as long as your account exists. When your account is deleted, we delete your profile, messages, notes, and game progress from our database. Files you uploaded, such as images, voice messages, and your profile picture, may remain in our file storage provider for some time after deletion.",
        },
        {
          type: "p",
          content: `To request a copy or correction of your information, or to request account deletion, email us at ${CONTACT}. You can revoke Christ App’s access in your Google Account settings. To delete information already stored in Christ App, send us a separate deletion request.`,
        },
      ],
    },
    {
      heading: "Changes to this policy",
      blocks: [
        {
          type: "p",
          content: `We publish the current version of this policy on this page. If you have questions about how we handle your information, contact us at ${CONTACT}.`,
        },
      ],
    },
  ],
};

export const termsOfService: LegalDocument = {
  title: "Terms of Service",
  effectiveDate: "November 11, 2026",
  intro: (
    <>
      Christ App is an app for chatting, reading the Bible, taking notes, and
      playing games together. By using Christ App, you agree to these Terms of
      Service. Christ App is provided by Eduard Sekan.
      You can contact us at {CONTACT}.
    </>
  ),
  sections: [
    {
      heading: "Your account",
      blocks: [
        {
          type: "p",
          content: `You sign in to Christ App with a Google Account. Use an account you are authorized to access. If you notice suspicious activity on your account, contact us at ${CONTACT}.`,
        },
      ],
    },
    {
      heading: "Community rules",
      blocks: [
        {
          type: "p",
          content:
            "Threats, harassment, discrimination, spam, fraud, and sharing someone else’s personal information without permission are prohibited in chats and elsewhere in the app. Share only content you have the right to share. Individual chats may have additional rules posted in the chat.",
        },
      ],
    },
    {
      heading: "Your content",
      blocks: [
        {
          type: "p",
          content:
            "You retain the rights to the messages, images, and notes you create. You give Christ App permission to store your content and display it to people who have access to it through the feature you use. This permission applies only as needed to provide that feature.",
        },
      ],
    },
    {
      heading: "Moderation and fair play",
      blocks: [
        {
          type: "p",
          content: `We may remove content or restrict access to an account if these terms or the community rules are violated. In Oтара, using cheats, unauthorized automation, or game bugs to gain an advantage is prohibited. We may correct game results or rewards that resulted from a bug or a rule violation. If you believe a moderation decision was made in error, contact us at ${CONTACT}.`,
        },
      ],
    },
    {
      heading: "Changes to the app and these terms",
      blocks: [
        {
          type: "p",
          content:
            "We may update Christ App’s features and temporarily limit access during maintenance. We publish the current version of these terms on this page.",
        },
        {
          type: "p",
          content: (
            <>
              For information about how we handle your data, see our{" "}
              <Link href="/privacy">Privacy Policy</Link>. To request account
              deletion or ask a question about these terms, email {CONTACT}.
            </>
          ),
        },
      ],
    },
  ],
};
