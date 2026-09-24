"use client";

import { use } from "react";
import WatchHall from "@/components/Cinema/WatchHall";

export default function CinemaRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = use(params);
  return <WatchHall key={roomId} roomId={roomId} />;
}
