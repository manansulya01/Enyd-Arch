/**
 * Development seed.
 *
 * Creates the society infrastructure (roles, achievements, interests), an
 * owner account awaiting its first device enrolment, and a living community of
 * demo members with posts, an archive, one playable game, events, a film,
 * gallery pieces and a few conversations. Demo members have no device
 * credentials, so they exist only as content — the owner's account is the one
 * you enrol in a browser.
 *
 * Idempotent: infrastructure upserts; the narrative content is written once.
 */
import { hash } from '@node-rs/argon2';
import { db, sql as client } from './index.js';
import * as schema from './schema.js';
import { and, eq, sql } from 'drizzle-orm';
import { nextMemberNumber } from '../src/server/member-number.js';
import {
  ADMIN_ROLES,
  CONNECTION_INTERESTS,
  INTEREST_GROUPS,
  INTEREST_LABELS,
} from '../src/lib/domain.js';
import { ACHIEVEMENT_DEFS } from './seed-data.js';
import { writeZip } from '../src/server/storage/zip.js';
import { processGamePackage } from '../src/server/storage/game-package.js';
import { putObject } from '../src/server/storage/driver.js';
import { storeUpload } from '../src/server/storage/uploads.js';
import { randomUUID } from 'node:crypto';

const PASSWORD_OPTS = { algorithm: 2 as const, memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 };

async function ensureUser(input: {
  username: string;
  displayName: string;
  ageBand: string;
  level: string;
  status?: string;
  password?: string;
  isMinor?: boolean;
  region?: string | null;
}) {
  const existing = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.username, input.username.toLowerCase()))
    .limit(1);
  if (existing[0]) return existing[0]!;

  const memberId = await nextMemberNumber();
  const [created] = await db
    .insert(schema.users)
    .values({
      memberId,
      username: input.username,
      displayName: input.displayName,
      ageBand: input.ageBand,
      isMinor: input.isMinor ?? false,
      level: input.level as never,
      status: (input.status ?? 'active') as never,
      passwordHash: input.password ? await hash(input.password, PASSWORD_OPTS) : null,
      region: input.region ?? null,
      onboardedAt: new Date(),
      termsAcceptedAt: new Date(),
      lastSeenAt: new Date(),
    })
    .returning();

  await db.insert(schema.userSettings).values({ userId: created!.id }).onConflictDoNothing();
  await db.insert(schema.profiles).values({ userId: created!.id }).onConflictDoNothing();
  return created!;
}

function ago(days: number, hours = 0): Date {
  return new Date(Date.now() - days * 86_400_000 - hours * 3_600_000);
}

function inDays(days: number): Date {
  return new Date(Date.now() + days * 86_400_000);
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run the development seed in production.');
  }

  console.log('seeding Enyd Arch…');

  for (const role of ADMIN_ROLES) {
    const found = await db.select().from(schema.adminRoles).where(eq(schema.adminRoles.role, role.role)).limit(1);
    if (found[0]) continue;
    await db.insert(schema.adminRoles).values({
      role: role.role as never,
      label: role.label,
      description: role.description,
      permissions: [...role.permissions],
      rank: role.rank,
    });
  }

  for (const achievement of ACHIEVEMENT_DEFS) {
    const found = await db.select().from(schema.achievements).where(eq(schema.achievements.key, achievement.key)).limit(1);
    if (found[0]) continue;
    await db.insert(schema.achievements).values(achievement);
  }

  const owner = await ensureUser({
    username: 'owner',
    displayName: 'The Founder',
    ageBand: '26',
    level: 'visitor',
    status: 'pending_verification',
    password: 'arch-owner-dev-1',
  });

  const mira = await ensureUser({ username: 'mira', displayName: 'Mira', ageBand: '20', level: 'curator', region: 'Mumbai region' });
  const cass = await ensureUser({ username: 'cass', displayName: 'Cass', ageBand: '18', level: 'creator', region: 'Pune region' });
  const jules = await ensureUser({ username: 'jules', displayName: 'Jules', ageBand: '23', level: 'contributor', region: 'Delhi region' });
  const reed = await ensureUser({ username: 'reed', displayName: 'Reed', ageBand: '16', level: 'member', isMinor: true, region: 'Pune region' });
  const sol = await ensureUser({ username: 'sol', displayName: 'Sol', ageBand: '18', level: 'archivist', region: 'Mumbai region' });
  const eden = await ensureUser({ username: 'eden', displayName: 'Eden', ageBand: '20', level: 'creator', region: 'Bengaluru region' });

  const bios: Array<[string, { headline: string; bio: string }]> = [
    [mira.id, { headline: 'Keeper of the Archive', bio: 'Indexing everything worth keeping. Ask me where the good documents live.' }],
    [cass.id, { headline: 'Games, zines, and bad puns', bio: 'Makes small games and smaller print runs.' }],
    [jules.id, { headline: 'Night photography', bio: 'Collects train stations and blue light.' }],
    [reed.id, { headline: 'Chess and cold tea', bio: 'Student. Gamer. Occasionally sensible.' }],
    [sol.id, { headline: 'Document hoarder', bio: 'Keeps notes from every lecture that mattered.' }],
    [eden.id, { headline: 'Music and long walks', bio: 'Records things. Recommends records.' }],
  ];
  for (const [userId, values] of bios) {
    await db.update(schema.profiles).set(values).where(eq(schema.profiles.userId, userId));
  }

  const ownerRole = await db.select().from(schema.adminRoles).where(eq(schema.adminRoles.role, 'owner')).limit(1);
  if (ownerRole[0]) {
    const existing = await db
      .select()
      .from(schema.adminAssignments)
      .where(and(eq(schema.adminAssignments.userId, owner.id), eq(schema.adminAssignments.adminRoleId, ownerRole[0].id)))
      .limit(1);
    if (!existing[0]) {
      await db.insert(schema.adminAssignments).values({ userId: owner.id, adminRoleId: ownerRole[0].id });
    }
  }

  for (const user of [mira, cass, jules, reed, sol, eden]) {
    const picks = INTEREST_GROUPS.flatMap((group) => group.items.slice(0, 2)).slice(0, 6);
    for (const key of picks) {
      const group = INTEREST_GROUPS.find((entry) => (entry.items as readonly string[]).includes(key));
      await db
        .insert(schema.interests)
        .values({ key, label: INTEREST_LABELS[key] ?? key, group: group?.group ?? 'Curiosity' })
        .onConflictDoNothing();
      const [row] = await db.select().from(schema.interests).where(eq(schema.interests.key, key)).limit(1);
      if (row) {
        await db.insert(schema.userInterests).values({ userId: user.id, interestId: row.id }).onConflictDoNothing();
      }
    }
  }

  for (const entry of CONNECTION_INTERESTS) {
    const found = await db
      .select()
      .from(schema.connectionInterests)
      .where(and(eq(schema.connectionInterests.label, entry.label), eq(schema.connectionInterests.mode, entry.mode as never)))
      .limit(1);
    if (!found[0]) {
      await db.insert(schema.connectionInterests).values({ mode: entry.mode as never, label: entry.label, weight: entry.weight });
    }
  }

  const adults = [mira, cass, jules, sol, eden];
  for (const user of [mira, cass, jules, reed, sol, eden]) {
    await db
      .insert(schema.userSettings)
      .values({ userId: user.id, connectionsEnabled: true })
      .onConflictDoUpdate({ target: schema.userSettings.userId, set: { connectionsEnabled: true } });

    const wantsDating = adults.includes(user) && !user.isMinor;
    await db
      .insert(schema.connectionPreferences)
      .values({
        userId: user.id,
        friendshipOptIn: true,
        collaborationOptIn: true,
        datingOptIn: wantsDating,
        showInDating: wantsDating,
      })
      .onConflictDoNothing();

    const catalogue = await db.select().from(schema.connectionInterests);
    const picks = catalogue.filter((_, index) => index % 3 === 0).slice(0, 5);
    for (const row of picks) {
      await db.insert(schema.userConnectionInterests).values({ userId: user.id, interestId: row.id }).onConflictDoNothing();
    }
  }

  const [existingPosts] = await db.select({ id: schema.posts.id }).from(schema.posts).limit(1);
  if (existingPosts) {
    console.log('narrative content already present — infrastructure refreshed only');
    await client.end();
    return;
  }

  // ── Narrative content ────────────────────────────────────────────────
  const [a, b] = mira.id < cass.id ? [mira.id, cass.id] : [cass.id, mira.id];
  await db.insert(schema.matches).values({ userAId: a!, userBId: b!, mode: 'friendship', status: 'accepted', sharedInterestCount: 3 }).onConflictDoNothing();

  const postSeed: Array<[typeof mira, string, string[]]> = [
    [mira, 'The archive gained twelve new documents tonight. Three of them are maps. We have a problem, in the best way. #archiving #maps', ['archiving', 'maps']],
    [cass, 'Shipped a tiny puzzle game called Half-Light. It takes about ninety seconds to play and it is completely a mood. Find it in the Arcade. #gamedev #indie', ['gamedev', 'indie']],
    [jules, 'Shot the last train out of the station at 1:12. The light did the thing. #photography #night', ['photography', 'night']],
    [eden, 'Listening list for this week: Nils Frahm, Khruangbin, and one very long Aphex Twin mix. What are you all playing? #music', ['music']],
    [sol, 'Notes from today’s seminar are in the Archive. Bring your own post-its next time. #notes #study', ['notes', 'study']],
    [reed, 'Anyone up for chess at the usual table tomorrow? I promise not to win too fast. #chess #games', ['chess', 'games']],
  ];

  const postIds: string[] = [];
  for (const [author, body, tags] of postSeed) {
    const [post] = await db
      .insert(schema.posts)
      .values({ authorId: author.id, body, lastActivityAt: ago(1), createdAt: ago(1.5) })
      .returning({ id: schema.posts.id });
    postIds.push(post!.id);
    for (const tag of tags) {
      await db.insert(schema.postHashtags).values({ postId: post!.id, tag }).onConflictDoNothing();
      await db
        .insert(schema.hashtags)
        .values({ tag })
        .onConflictDoUpdate({ target: schema.hashtags.tag, set: { useCount: sql`${schema.hashtags.useCount} + 1` } });
    }
  }

  const commentSeed: Array<[number, typeof cass, string]> = [
    [0, cass, 'The maps are catalogued under Cartography. Worth a wander.'],
    [1, mira, 'This sounds extremely like you, in the best way.'],
    [4, jules, 'Adding my notes on the reading to yours tonight.'],
    [5, eden, 'I will bring the analysis board. And the biscuits.'],
  ];
  for (const [index, author, body] of commentSeed) {
    await db.insert(schema.comments).values({ postId: postIds[index]!, authorId: author.id, body, createdAt: ago(0.9) });
    await db.update(schema.posts).set({ commentCount: sql`${schema.posts.commentCount} + 1` }).where(sql`${schema.posts.id} = ${postIds[index]!}`);
  }
  for (const postId of postIds) {
    await db
      .insert(schema.reactions)
      .values([
        { userId: mira.id, targetType: 'post', targetId: postId, kind: 'appreciate' },
        { userId: eden.id, targetType: 'post', targetId: postId, kind: 'curious' },
      ])
      .onConflictDoNothing();
    await db.update(schema.posts).set({ reactionCount: 2 }).where(sql`${schema.posts.id} = ${postId}`);
  }

  const [pollPost] = await db
    .insert(schema.posts)
    .values({ authorId: mira.id, body: 'What should the March event be?', lastActivityAt: ago(0.4), createdAt: ago(0.4) })
    .returning({ id: schema.posts.id });
  const [poll] = await db
    .insert(schema.polls)
    .values({ postId: pollPost!.id, question: 'March event', closesAt: inDays(20) })
    .returning({ id: schema.polls.id });
  for (const [position, option] of (['Game night', 'Archive open hours', 'Photo walk', 'Study circle'] as const).entries()) {
    await db.insert(schema.pollOptions).values({ pollId: poll!.id, label: option, position, votes: option === 'Game night' ? 3 : 1 });
  }

  // A real Archive file
  const textDoc = new TextEncoder().encode(
    '# How to Keep a Notebook\n\nWrite things down. Date them. Cross-reference.\nNothing is wasted; everything is indexed.\n',
  );
  const storedDoc = await storeUpload({
    uploaderId: sol.id,
    filename: 'notebooks.md',
    declaredMime: 'text/markdown',
    data: textDoc,
    purpose: 'upload',
  });
  await db.insert(schema.archiveObjects).values({
    catalogueNumber: 301,
    slug: 'how-to-keep-a-notebook',
    title: 'How to Keep a Notebook',
    description: 'A short member’s guide to notes that survive the term.',
    category: 'student_resources',
    contributorId: sol.id,
    fileId: storedDoc.ok ? storedDoc.file.fileId : null,
  });
  await db.insert(schema.archiveObjects).values({
    catalogueNumber: 312,
    slug: 'maps-of-the-old-campus',
    title: 'Maps of the Old Campus',
    description: 'A set of scanned hand-drawn maps. Attribution pending.',
    category: 'interesting_things',
    contributorId: mira.id,
  });

  // A playable game
  const gameHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Half-Light</title>
<style>body{margin:0;background:#101320;color:#e8e2d2;font-family:serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh}
canvas{border:1px solid #3a4152;border-radius:8px}p{opacity:.7}</style></head>
<body><h1>Half-Light</h1><canvas id="c" width="320" height="320"></canvas>
<p>Move with your mouse. Keep the moth alive.</p>
<script src="game.js"></script></body></html>`;
  const gameJs = `const ctx=document.getElementById('c').getContext('2d');
let mx=160,my=160,x=160,y=160,vx=0,vy=0;
addEventListener('mousemove',e=>{const r=document.querySelector('canvas').getBoundingClientRect();mx=e.clientX-r.left;my=e.clientY-r.top});
function step(){vx+=(mx-x)*0.002;vy+=(my-y)*0.002;vx*=0.96;vy*=0.96;x+=vx;y+=vy;
ctx.fillStyle='rgba(16,19,32,.2)';ctx.fillRect(0,0,320,320);
ctx.fillStyle='#d8b76a';ctx.beginPath();ctx.arc(x,y,6,0,7);ctx.fill();requestAnimationFrame(step)}step();`;
  const gameZip = writeZip([
    { path: 'index.html', data: new TextEncoder().encode(gameHtml) },
    { path: 'game.js', data: new TextEncoder().encode(gameJs) },
  ]);
  const processed = processGamePackage(gameZip);
  if (processed.ok && processed.packageBytes) {
    const stored = await putObject({
      purpose: 'game_package',
      id: randomUUID(),
      extension: 'zip',
      data: processed.packageBytes,
      contentType: 'application/zip',
    });
    const [game] = await db
      .insert(schema.games)
      .values({
        slug: 'half-light',
        title: 'Half-Light',
        tagline: 'Keep the moth alive in a square of dark.',
        description: 'A tiny browser sketch about softness and attention.',
        creatorId: cass.id,
        genre: 'experimental',
        controls: 'Move the mouse. The moth follows, lazily.',
        status: 'approved',
        entryFile: 'index.html',
        packageObjectId: stored.id,
        packageChecksum: processed.checksum,
        scanReport: { findings: processed.report.findings, blocked: false },
      })
      .returning({ id: schema.games.id });
    await db.insert(schema.gameTags).values({ gameId: game!.id, tag: 'sketch' }).onConflictDoNothing();
  }

  await db.insert(schema.events).values([
    { slug: 'archive-open-hours', hostId: mira.id, title: 'Archive Open Hours', description: 'Drop in to help catalogue, or just browse the new shelves.', kind: 'archive_event', startsAt: inDays(6), location: 'The Archive room 204', attendingCount: 5 },
    { slug: 'half-light-launch', hostId: cass.id, title: 'Half-Light Launch + Q&A', description: 'Play the new game together, then talk about making small things.', kind: 'game_jam', startsAt: inDays(3), location: 'Arcade hall', attendingCount: 12 },
  ]);

  const [film] = await db
    .insert(schema.films)
    .values({
      slug: 'paterson',
      title: 'Paterson',
      year: 2016,
      director: 'Jim Jarmusch',
      synopsis: 'A bus driver writes poems in secret. An entire overlooked week.',
      watchLinks: [{ service: 'Criterion Channel', url: 'https://www.criterionchannel.com/' }],
      runtimeMinutes: 113,
    })
    .returning();
  await db.insert(schema.watchEvents).values({
    slug: 'paterson-night',
    filmId: film!.id,
    hostId: eden.id,
    startsAt: inDays(8),
    roomUrl: 'https://www.criterionchannel.com/',
    roomProvider: 'Criterion Channel',
  });
  await db.insert(schema.filmReviews).values({ filmId: film!.id, authorId: eden.id, rating: 8.5, body: 'Quiet as paper. The ending holds.' });

  await db.insert(schema.galleryPosts).values([
    { slug: 'field-notes', authorId: eden.id, kind: 'writing', title: 'Field Notes', caption: 'Six short pieces about trains and weather.', body: 'I. The platform was empty except for one man reading a battered paperback…\n\nII. Rain on the window turned the carriage into an aquarium…' },
    { slug: 'blue-hour-studies', authorId: jules.id, kind: 'photography', title: 'Blue Hour Studies', caption: 'An ongoing set. New plates monthly.' },
  ]);

  const [project] = await db
    .insert(schema.projects)
    .values({ slug: 'campus-zine', title: 'Campus Zine', summary: 'Print on paper, collect interviews, pass it around.', description: 'A monthly zine made by students about student life. Next print deadline is the 20th.', ownerId: cass.id })
    .returning();
  await db.insert(schema.projectMembers).values([
    { projectId: project!.id, userId: cass.id, role: 'owner' },
    { projectId: project!.id, userId: mira.id, role: 'contributor' },
  ]);
  const [pConversation] = await db
    .insert(schema.conversations)
    .values({ kind: 'project', title: 'Campus Zine', projectId: project!.id, createdById: cass.id })
    .returning();
  await db.insert(schema.conversationMembers).values([
    { conversationId: pConversation!.id, userId: cass.id, role: 'owner' },
    { conversationId: pConversation!.id, userId: mira.id, role: 'member' },
  ]);
  await db.insert(schema.projectTasks).values([
    { projectId: project!.id, title: 'Interview three students', detail: '', createdBy: cass.id, position: 0, status: 'doing' },
    { projectId: project!.id, title: 'Print 200 copies', detail: '', createdBy: cass.id, position: 1, status: 'todo' },
  ]);
  await db.update(schema.projects).set({ taskCount: 2, openTasks: 2 }).where(eq(schema.projects.id, project!.id));

  const [dm] = await db.insert(schema.conversations).values({ kind: 'direct', createdById: mira.id }).returning();
  await db.insert(schema.conversationMembers).values([
    { conversationId: dm!.id, userId: mira.id },
    { conversationId: dm!.id, userId: eden.id },
  ]);
  await db.insert(schema.messages).values([
    { conversationId: dm!.id, senderId: mira.id, body: 'The maps are in. You should see the third one.' },
    { conversationId: dm!.id, senderId: eden.id, body: 'The one with the tunnels?? Bringing coffee tomorrow.' },
  ]);
  await db.update(schema.conversations).set({ lastMessageAt: ago(0.3), lastMessagePreview: 'The one with the tunnels??' }).where(eq(schema.conversations.id, dm!.id));

  await db.insert(schema.chronicleEntries).values([
    { kind: 'public', era: 'October 2026', headline: 'Enyd Arch opened its doors', body: 'The first members entered. The Archive held twelve objects. The Commons held one conversation.', occurredOn: new Date('2026-10-05T00:00:00Z') },
    { kind: 'public', era: 'October 2026', headline: 'The Archive crossed its first hundred objects', body: 'A Cartography shelf was created. A map went missing for a day, then was found.', occurredOn: ago(2) },
    { kind: 'hidden', era: 'October 2026', headline: 'The map with no legend', body: 'Object ARC-000317 was catalogued by no one and curated by no one. It is still on the shelf.', occurredOn: ago(1), unlockLevel: 'archivist', unlockHint: 'Reach Archivist standing to read this entry.' },
  ]);


  console.log('seed complete');
  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
