export type MessageDictionary = Readonly<Record<string, string>>;

export function translateMessage(
  dictionaries: readonly MessageDictionary[],
  message: string,
) {
  for (const dictionary of dictionaries) {
    const translated = dictionary[message];
    if (translated) return translated;
  }
  return message;
}
