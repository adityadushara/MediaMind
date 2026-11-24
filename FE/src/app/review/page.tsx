"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { BookOpen } from "lucide-react";

export default function ReviewPage() {
  const router = useRouter();

  // Verification happens inside the library. Send the user straight to the
  // items that actually need a human decision instead of the unfiltered shelf.
  useEffect(() => {
    router.replace("/library?verification_status=needs_review");
  }, [router]);

  return (
    <div className="min-h-screen bg-[#FBF9F5] flex flex-col items-center justify-center p-6 text-center space-y-4">
      <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-700 animate-pulse">
        <BookOpen className="h-6 w-6" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-stone-900">Opening items that need review…</h2>
        <p className="text-xs text-stone-500 mt-1 max-w-sm">
          Screenshots are added to your library automatically. Any match the AI was
          unsure about is filtered for you here, with the original screenshot kept for
          comparison.
        </p>
      </div>
    </div>
  );
}
