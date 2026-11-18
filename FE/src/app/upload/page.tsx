"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud } from "lucide-react";

export default function UploadPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/library?upload=true");
  }, [router]);

  return (
    <div className="min-h-screen bg-[#FBF9F5] flex flex-col items-center justify-center p-6 text-center space-y-4">
      <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-700 animate-pulse">
        <UploadCloud className="h-6 w-6" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-stone-900">Opening Library Upload...</h2>
        <p className="text-xs text-stone-500 mt-1 max-w-sm">
          Screenshots are uploaded directly within your library.
        </p>
      </div>
    </div>
  );
}
