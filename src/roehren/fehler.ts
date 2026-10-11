// Fehler der Bibliothek (lib/errors.ts) auf Deutsch, dort wo ein Teilnehmer sie sieht. Die Bibliothek
// selbst bleibt unverändert — sie ist ein eigenes Paket des Originals, ihre Tests prüfen die Texte.
import {NoteSpentError, NoteUnknownError} from '../lnurlcash'

export const aufDeutsch = (err: unknown): string => {
  if (err instanceof NoteSpentError) return 'Dieser Schein wurde schon eingelöst.'
  if (err instanceof NoteUnknownError) return 'Die Ausgabestelle kennt diesen Schein nicht (mehr).'
  return (err as Error)?.message ?? String(err)
}
