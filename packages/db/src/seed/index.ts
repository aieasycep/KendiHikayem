/**
 * Seed runner. `pnpm --filter @kendihikayem/db db:seed`.
 *
 * Two layers, in this order:
 *   1. catalogue + legal documents + plans — required in every environment, including
 *      production. Without them the generator has no prompt pack and no cost cap.
 *   2. development fixture — one parent, two children, one voice, one complete story.
 *      Skipped when NODE_ENV=production, because seeding a fake Ayşe into a real database
 *      is the kind of mistake that only gets noticed by a customer.
 *
 * Every row is keyed by a deterministic UUID, so running this twice is a no-op rather than
 * a duplicate — verified by running it twice and diffing the row counts.
 */
import { createDb, resolveCliDatabaseUrl } from '../client';
import {
  seedArtStyles,
  seedBookFormats,
  seedCharacterBuilderOptions,
  seedLegalDocuments,
  seedPlans,
  seedStoryThemes,
  seedSystemVoices,
  seedVoiceScripts,
} from './catalog';
import { seedDevData } from './dev';

const log = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

async function main(): Promise<void> {
  const url = resolveCliDatabaseUrl();
  log(`[db:seed] hedef: ${url.replace(/\/\/([^:]+):[^@]*@/, '//$1:***@')}`);

  const handle = createDb({ url, max: 1 });
  try {
    const { db } = handle;

    log('[db:seed] katalog…');
    const counts: Record<string, number> = {
      legal_documents: await seedLegalDocuments(db),
      plans: await seedPlans(db),
      story_themes: await seedStoryThemes(db),
      art_styles: await seedArtStyles(db),
      character_builder_options: await seedCharacterBuilderOptions(db),
      book_formats: await seedBookFormats(db),
      system_voices: await seedSystemVoices(db),
      voice_scripts: await seedVoiceScripts(db),
    };

    if (process.env['NODE_ENV'] === 'production') {
      log('[db:seed] NODE_ENV=production — geliştirme verisi ATLANDI.');
    } else {
      log('[db:seed] geliştirme verisi…');
      Object.assign(counts, await seedDevData(db));
    }

    for (const [table, count] of Object.entries(counts)) {
      log(`  ${table.padEnd(28)} ${count}`);
    }
    log('[db:seed] tamam.');
  } finally {
    await handle.close();
  }
}

await main();
