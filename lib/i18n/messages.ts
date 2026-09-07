import type { Locale } from './locale';

export type MessageDictionary = Readonly<
  Record<string, Readonly<Record<Locale, string>>>
>;
type MessageKeys<D> = D extends MessageDictionary ? keyof D & string : never;
export type MessageParams = Readonly<Record<string, string | number>>;

export function createTranslator<const D extends readonly MessageDictionary[]>(
  locale: Locale,
  dictionaries: D,
) {
  return (key: MessageKeys<D[number]>, params: MessageParams = {}): string => {
    const message = dictionaries.find((dictionary) =>
      Object.hasOwn(dictionary, key),
    )?.[key];
    if (!message) throw new Error(`Unknown translation key: ${key}`);
    return message[locale].replace(/\{(\w+)\}/g, (placeholder, name: string) =>
      Object.hasOwn(params, name) ? String(params[name]) : placeholder,
    );
  };
}

export type Translator<D extends MessageDictionary> = ReturnType<
  typeof createTranslator<readonly [D]>
>;
