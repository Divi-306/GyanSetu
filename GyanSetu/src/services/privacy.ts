import { db } from '@/db';
import { api, hasSession } from '@/lib/api';
import { selectOnline, useApp } from '@/stores/appStore';
import { changed } from './learningPacks';
import { refreshPendingCount } from './sync';

/**
 * "Clear learning history": progress, answers, study time, video positions, tutor chats
 * and career guidance — on the phone and on the server. Downloaded packs and the
 * library stay. (Deleting the account, in Profile, removes everything.)
 *
 * For a logged-in student the server copy must be deleted too, otherwise the next sync
 * would bring the history back — so it needs an internet connection.
 */
export async function clearLearningHistory(): Promise<void> {
  const authed = await hasSession();
  if (authed) {
    if (!selectOnline(useApp.getState())) throw new Error('This feature requires an internet connection.');
    await api('/v1/learning-packs/history', { method: 'DELETE' });
  }
  await db.withTransactionAsync(async () => {
    await db.execAsync(`
      DELETE FROM lp_progress;
      DELETE FROM lp_topic_progress;
      DELETE FROM lp_answers;
      DELETE FROM lp_chat;
      DELETE FROM lp_video_progress;
      DELETE FROM study_days;
      DELETE FROM kv WHERE key LIKE 'tutor.session.%' OR key LIKE 'career.%';
      -- Unsent history must not be uploaded after it was cleared. Library changes still go.
      DELETE FROM sync_queue WHERE type LIKE 'LP_%' AND type <> 'LP_LIBRARY_CHANGED';
    `);
  });
  await refreshPendingCount();
  changed();
}
