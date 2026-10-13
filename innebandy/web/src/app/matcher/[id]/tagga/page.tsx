"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { Workspace } from "@/components/tagging/Workspace";

function TagPage() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const videoId = params.get("video");
  if (!videoId) return <p className="p-6">Ingen video vald.</p>;
  return <Workspace matchId={id} videoId={videoId} />;
}

export default function Page() {
  return (
    <AppShell fullBleed>
      <Suspense>
        <TagPage />
      </Suspense>
    </AppShell>
  );
}
