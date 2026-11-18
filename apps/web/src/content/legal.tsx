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
  /** Короткий опис для meta description. */
  description: string;
  effectiveDate: string;
  lastUpdated: string;
  intro: ReactNode;
  sections: LegalSection[];
};

/** Контакт власника застосунку (публічний, використовується в Privacy, Terms і футері). */
export const CONTACT = "sekaneduard@gmail.com";

export const privacyPolicy: LegalDocument = {
  title: "Privacy Policy",
  description:
    "How Christ App collects, uses, stores and deletes personal data, including information received through Google Sign-In.",
  effectiveDate: "November 11, 2026",
  lastUpdated: "November 18, 2026",
  intro: (
    <>
      This Privacy Policy explains how Christ App (the “app”, “we”) handles
      personal information when you sign in and use the app. Christ App is
      operated by Eduard Sekan, who is responsible for processing your
      information. You can contact us at{" "}
      <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
    </>
  ),
  sections: [
    {
      heading: "1. Information we collect",
      blocks: [
        {
          type: "ul",
          items: [
            <>
              <strong>Google Sign-In data.</strong> When you sign in with
              Google, we request the <code>openid</code>, <code>email</code>{" "}
              and <code>profile</code> scopes only. Christ App receives your
              Google account ID, email address, name and profile picture, if
              available. We do not receive your Google password and we do not
              request access to other Google services such as Gmail, Drive or
              Contacts.
            </>,
            <>
              <strong>Account details.</strong> Your email address, your
              @username and nickname, and, if you register with a password
              instead of Google, a hashed (not plain-text) password.
            </>,
            <>
              <strong>Profile and preferences.</strong> Optional profile
              picture, short bio, and appearance settings such as theme colors,
              fonts, chat backgrounds and message bubble style.
            </>,
            <>
              <strong>Content you create.</strong> Messages you send in chats
              (text, images, files, voice messages and video notes), reactions,
              Bible verses you save, and content you place in your private
              notes space. In the Oтара game and other mini-games we store your
              progress, results and in-game items. Pictures you upload for the
              puzzle game are shown to other players.
            </>,
            <>
              <strong>Activity information.</strong> Whether you are online,
              when you were last seen, which chats you have read, and
              participation in shared video rooms and calls.
            </>,
            <>
              <strong>Technical information.</strong> Session cookies and
              tokens that keep you signed in, a push-notification subscription
              (browser endpoint and encryption keys, plus your browser’s
              user-agent) if you enable notifications, and your IP address as
              it reaches our server, which is used for abuse prevention and
              rate limiting.
            </>,
          ],
        },
      ],
    },
    {
      heading: "2. How we use information",
      blocks: [
        {
          type: "ul",
          items: [
            "To create your account, sign you in and keep you signed in.",
            "To display your profile to other members and to deliver your messages, reactions and game results to the people who can see them.",
            "To provide features you use: chat, Bible reading and saved verses, notes, mini-games, shared video rooms, calls and push notifications.",
            "To keep the community safe: enforcing the Terms of Service, handling reports, and preventing spam and abuse.",
            "To operate, maintain and troubleshoot the app.",
          ],
        },
        {
          type: "p",
          content:
            "Google user data (account ID, email, name and profile picture) is used only to create and operate your Christ App account and to display your profile. We do not sell personal data, and we do not use Google user data for advertising.",
        },
        {
          type: "p",
          content:
            "Christ App’s use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.",
        },
      ],
    },
    {
      heading: "3. Who can access your information",
      blocks: [
        {
          type: "p",
          content:
            "Messages are visible to participants of the chat where you send them. Other members can see the profile details and game results shown in the relevant parts of the app. We may review messages and reports to enforce community rules and respond to user requests. We may also disclose information when required by law.",
        },
      ],
    },
    {
      heading: "4. Third-party service providers",
      blocks: [
        {
          type: "p",
          content:
            "We use the following providers to run specific features. Each receives only the data needed for its function:",
        },
        {
          type: "ul",
          items: [
            <>
              <strong>Google</strong> — sign-in (OAuth 2.0 / OpenID Connect).
            </>,
            <>
              <strong>Cloudinary</strong> — storage and delivery of uploaded
              images, including profile pictures.
            </>,
            <>
              <strong>Agora</strong> — real-time audio/video infrastructure for
              calls.
            </>,
            <>
              <strong>YouTube Data API and TMDB</strong> — video and movie
              search in the shared video rooms. Search terms you enter are sent
              to these services from our server.
            </>,
            <>
              <strong>Bible text API (api.prayerpulse.io)</strong> — Scripture
              text. Requests contain the book and chapter being read and are
              sent through our server.
            </>,
            <>
              <strong>Browser push services</strong> (operated by your browser
              or device vendor) — delivery of push notifications you enable.
            </>,
            <>
              <strong>Hosting and database.</strong> Hetzner Online GmbH
              (Germany/Finland) — the Christ App server and PostgreSQL
              database run on a virtual server operated by Hetzner.
            </>,
          ],
        },
      ],
    },
    {
      heading: "5. Where and how information is stored",
      blocks: [
        {
          type: "p",
          content:
            "Account data, messages, saved verses and game data are stored in the Christ App PostgreSQL database. Uploaded images and files are stored with our file-storage provider (Cloudinary) or on the application server. Passwords, if you use one, are stored only as hashes, and session refresh tokens are stored only as hashes. Your access token is kept in your browser and a refresh token in an HTTP-only cookie. No online service is perfectly secure, so we cannot guarantee absolute security.",
        },
      ],
    },
    {
      heading: "6. Retention and deletion",
      blocks: [
        {
          type: "p",
          content:
            "We keep your account data for as long as your account exists. When your account is deleted, we delete your profile, messages, notes and game progress from our database. Files you uploaded, such as images, voice messages and your profile picture, may remain in our file-storage provider for some time after deletion.",
        },
        {
          type: "p",
          content: (
            <>
              <strong>How to delete your account and data.</strong> Christ App
              does not currently have a self-service delete button. To request
              deletion of your account and data, or a copy or correction of
              your information, email{" "}
              <a href={`mailto:${CONTACT}`}>{CONTACT}</a> from the email
              address linked to your account. You can also revoke Christ App’s
              access to your Google Account at any time at{" "}
              <a
                href="https://myaccount.google.com/permissions"
                rel="noopener noreferrer"
              >
                myaccount.google.com/permissions
              </a>
              ; this does not delete information already stored in Christ App,
              so send a separate deletion request for that.
            </>
          ),
        },
      ],
    },
    {
      heading: "7. Children",
      blocks: [
        {
          type: "p",
          content: (
            <>
              You must be at least 13 years old to use Christ App. If you
              believe a child under 13 has provided personal information to us
              in violation of this requirement, contact us and we will delete it.
            </>
          ),
        },
      ],
    },
    {
      heading: "8. Changes to this policy",
      blocks: [
        {
          type: "p",
          content:
            "We publish the current version of this policy on this page and update the “Last updated” date when it changes.",
        },
      ],
    },
    {
      heading: "9. Contact",
      blocks: [
        {
          type: "p",
          content: (
            <>
              Questions about this policy or your data:{" "}
              <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. See also our{" "}
              <Link href="/terms">Terms of Service</Link>.
            </>
          ),
        },
      ],
    },
  ],
};

export const termsOfService: LegalDocument = {
  title: "Terms of Service",
  description:
    "The terms that apply when you use Christ App: accounts, community rules, your content and moderation.",
  effectiveDate: "November 11, 2026",
  lastUpdated: "November 18, 2026",
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
