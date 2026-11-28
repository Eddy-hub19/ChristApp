"use client";

import dynamic from "next/dynamic";
import { useAuth } from "@/hooks/useAuth";

const RadioScreen = dynamic(() => import("@/components/Radio/RadioScreen"), { ssr: false });

export default function MusicPage() {
  const { user } = useAuth({ redirectIfUnauthenticated: "/" });
  if (!user) return null;
  return <RadioScreen />;
}
