let workerPromise: Promise<import("tesseract.js").Worker> | undefined;

function workerLaden(): Promise<import("tesseract.js").Worker> {
  if (!workerPromise) {
    workerPromise = import("tesseract.js")
      .then(async ({ createWorker, OEM, PSM }) => {
        const worker = await createWorker("eng", OEM.LSTM_ONLY);
        await worker.setParameters({
          tessedit_char_whitelist: "0123456789,.",
          tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        });
        return worker;
      })
      .catch((error: unknown) => {
        workerPromise = undefined;
        throw error;
      });
  }
  return workerPromise;
}

export function zaehlerstandKandidaten(text: string): string[] {
  return [...new Set(
    (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((wert) => wert.replace(",", ".")),
  )];
}

export async function zaehlerstandErkennen(bild: Blob): Promise<string[]> {
  const worker = await workerLaden();
  const ergebnis = await worker.recognize(bild);
  return zaehlerstandKandidaten(ergebnis.data.text);
}
