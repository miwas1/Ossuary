// Prompts whose real input token counts the smoke test records (Requirement 25.5, D-60). They cover
// the text that tokenizes worst, so Property P1-5 meets it. Each is about 2 KB, plus one long reference.

export interface CorpusPrompt {
  id: string;
  system: string;
  turn: string;
  reference?: string;
}

const SYSTEM = "You are a careful assistant. Reply with one word.";
const toSize = (seed: string, bytes: number) => seed.repeat(Math.ceil(bytes / Buffer.byteLength(seed))).slice(0, bytes);

export const TOKEN_CORPUS: readonly CorpusPrompt[] = [
  { id: "english", system: SYSTEM, turn: toSize("The keeper climbed the spiral stair each night, trimmed the wick and watched the ships pass the reef in silence. ", 2048) },
  { id: "pidgin", system: SYSTEM, turn: toSize("Abeg, wetin dey happen for market today? Na so the matter be o, we go see am for evening. Oga don talk say make we wait small. ", 2048) },
  { id: "yoruba", system: SYSTEM, turn: toSize("Ẹ kú àárọ̀. Ṣé dáadáa ni? Mo fẹ́ ra ọjà ní ọjà Ọ̀yọ́ lónìí, ṣùgbọ́n owó ti wọ́n jù. Ẹ ṣé púpọ̀. ", 2048) },
  { id: "naira", system: SYSTEM, turn: toSize("Total ₦12,500.00; VAT ₦937.50; subtotal ₦11,562.50; paid ₦20,000.00; change ₦7,500.00. ", 2048) },
  { id: "json", system: SYSTEM, turn: toSize('{"vendor":"Shoprite Ikeja","date":"2026-11-26","items":[{"name":"rice 5kg","qty":1,"kobo":1250000},{"name":"oil","qty":2,"kobo":480000}],"total_kobo":2210000} ', 2048) },
  { id: "digits", system: SYSTEM, turn: toSize("40958372610593847261038475610293847561029384756102938475610 ", 2048) },
  { id: "emoji", system: SYSTEM, turn: toSize("👻💀🦴🕯️🎃🧛‍♂️🧟‍♀️🕸️🦇⚰️🪦👻🎃💀 ", 2048) },
  { id: "base64", system: SYSTEM, turn: toSize("aGVsbG8gd29ybGQ9PXp6eS8rQUJDREVGRzEyMzQ1Njc4OTBxd2VydHl1aW9wYXNkZmdoamts/+Zx9Qw== ", 2048) },
  { id: "reference", system: SYSTEM, turn: "What kind of document is described in the reference?", reference: toSize("Section 4.2. A receipt shows the vendor, the date, each line item with its quantity and price, the subtotal, VAT at 7.5 percent and the total. ", 40_960) },
];
