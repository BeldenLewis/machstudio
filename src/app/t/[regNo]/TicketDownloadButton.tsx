"use client";

import { downloadTicketImage, type TicketImageInput } from "@/lib/collect-form/ticket-image";

export function TicketDownloadButton({ ticket }: { ticket: TicketImageInput }) {
  return (
    <button
      type="button"
      onClick={() => {
        void downloadTicketImage(ticket).catch(() => {
          window.alert("We couldn't save the ticket image. Please take a screenshot instead.");
        });
      }}
      className="mt-5 block w-full rounded-xl bg-neutral-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-neutral-800 active:scale-[0.99]"
    >
      Save as Image
    </button>
  );
}
