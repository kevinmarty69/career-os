import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { syntheticProfile } from '../../lib/fixture';
import {
  emptyInterview,
  listInterviews,
  saveInterview,
} from '../../lib/guided-interview';
import {
  memoryConflicts,
  resolveMemoryConflict,
} from '../../lib/memory-conflicts';
import { closeApplicationDatabases, database } from '../../lib/server/database';
import {
  readAffectedApplications,
  readLivingProfile,
  saveLivingProfile,
} from '../../lib/server/profile';
import {
  createApplication,
  updateApplication,
} from '../../lib/server/applications';
import { deleteWorkspace } from '../../lib/server/workspace';

test('handoff decisions and multiple interviews survive real SQL ID remapping', async () => {
  if (process.env.ALLOW_HANDOFF_MEMORY_SMOKE !== '1')
    throw new Error('Explicit synthetic workspace smoke opt-in required.');
  if (!process.env.DATABASE_URL || !process.env.MIGRATION_DATABASE_URL)
    throw new Error(
      'Application and migration database URLs are required before creating fixtures.',
    );
  const admin = database(process.env.MIGRATION_DATABASE_URL);
  const session = {
    userId: randomUUID(),
    tenantId: randomUUID(),
    tenantName: 'Synthetic handoff smoke',
    sessionCreatedAt: new Date(),
  };
  let created = false;
  try {
    await database().begin(async (tx) => {
      await tx.unsafe('set local role career_app');
    });
    await admin.begin(async (tx) => {
      await tx`insert into career_identity."user" (id,name,email,"emailVerified") values (${session.userId},'Synthetic handoff owner',${`${session.userId}@example.test`},true)`;
      await tx`insert into career_identity.organization (id,name,slug,"createdAt") values (${session.tenantId},${session.tenantName},${session.tenantId},now())`;
      await tx`insert into career_identity.member (id,"organizationId","userId",role,"createdAt") values (${randomUUID()},${session.tenantId},${session.userId},'owner',now())`;
    });
    created = true;
    const base = { ...syntheticProfile.claims[0], level: 'declared' as const };
    await saveLivingProfile(
      session,
      {
        ...syntheticProfile,
        claims: [
          { ...base, id: 'six', statement: 'I led a team of 6 engineers.' },
          { ...base, id: 'nine', statement: 'I led a team of 9 engineers.' },
        ],
      },
      0,
    );
    let stored = (await readLivingProfile(session))!;
    assert.deepEqual(
      stored.profile.claims.map((claim) => claim.level),
      ['unsupported', 'unsupported'],
    );
    const group = memoryConflicts(stored.profile)[0];
    const contexts = {
      [group[0].id]: 'Direct reports during 2021',
      [group[1].id]: 'Wider delivery group during 2023',
    };
    await saveLivingProfile(
      session,
      resolveMemoryConflict(
        stored.profile,
        group[0].id,
        { source: randomUUID(), evidence: randomUUID() },
        new Date().toISOString(),
        contexts,
      ),
      stored.revision,
    );
    for (let i = 0; i < 2; i++) {
      stored = (await readLivingProfile(session))!;
      assert.equal(memoryConflicts(stored.profile).length, 0);
      await saveLivingProfile(
        session,
        saveInterview(
          stored.profile,
          {
            ...emptyInterview,
            sessionId: randomUUID(),
            answers: ['Synthetic private context', '', '', '', ''],
            statement:
              i === 0
                ? 'Synthetic deployment testimony'
                : 'Synthetic mentoring testimony',
            shareStatement: i === 1,
          },
          { source: randomUUID(), evidence: randomUUID(), claim: randomUUID() },
          new Date().toISOString(),
        ),
        stored.revision,
      );
    }
    stored = (await readLivingProfile(session))!;
    assert.equal(stored.revision, 4);
    assert.equal(memoryConflicts(stored.profile).length, 0);
    assert.equal(listInterviews(stored.profile).length, 2);
    assert.equal(
      stored.profile.claims.filter((claim) => claim.level === 'declared')
        .length,
      4,
    );
    const shared = stored.profile.claims.find(
      (claim) => claim.statement === 'Synthetic mentoring testimony',
    )!;
    assert.deepEqual(shared.allowedUses, [
      'application',
      'resume',
      'interview',
    ]);
    assert.equal(
      stored.profile.evidence.find((item) =>
        shared.evidenceIds.includes(item.id),
      )?.excerpt,
      shared.statement,
    );
    assert.equal(
      await readLivingProfile({ ...session, userId: randomUUID() }),
      null,
    );
    const application = (
      await createApplication(
        session,
        {
          company: 'Synthetic related company',
          role: 'Synthetic engineer',
          description: 'Synthetic role for a read-only impact test.',
          accent: '#16211F',
        },
        randomUUID(),
      )
    ).application;
    // Inert historical fixture: no worker step, provider request or publication.
    await admin.begin(async (tx) => {
      const snapshotId = randomUUID(),
        opportunityId = randomUUID();
      await tx`insert into app.profiles (id,tenant_id,name,headline,profile_kind)
        values (${snapshotId},${session.tenantId},'Synthetic','Synthetic snapshot','snapshot')`;
      await tx`insert into app.claims (tenant_id,profile_id,statement,level,sensitivity,allowed_uses)
        values (${session.tenantId},${snapshotId},'Old synthetic wording','unsupported','private',array['application'])`;
      await tx`insert into app.opportunities (id,tenant_id,application_id,application_revision,company,role,raw_text,extraction_status)
        values (${opportunityId},${session.tenantId},${application.applicationId},${application.revision},'Synthetic','Synthetic','Synthetic','ready')`;
      await tx`insert into app.workflow_runs (tenant_id,opportunity_id,profile_id,state,status,token_budget,cost_budget_micros,deadline_at)
        values (${session.tenantId},${opportunityId},${snapshotId},'research','cancelled',1,0,now())`;
    });
    assert.equal(
      (await readAffectedApplications(session, 'Old synthetic wording'))[0]
        ?.applicationId,
      application.applicationId,
    );
    assert.equal(
      (await readAffectedApplications(session, 'Different wording')).length,
      0,
    );
    assert.equal(
      (
        await readAffectedApplications(
          { ...session, userId: randomUUID() },
          'Old synthetic wording',
        )
      ).length,
      0,
    );
    await updateApplication(session, application.applicationId, {
      company: application.company,
      role: application.role,
      description: application.description,
      accent: application.accent,
      stage: 'applied',
      expectedRevision: application.revision,
    });
    assert.equal(
      (await readAffectedApplications(session, 'Old synthetic wording')).length,
      0,
    );
  } finally {
    try {
      if (created) {
        await deleteWorkspace(session, { confirmation: 'DELETE' });
        await admin`delete from career_identity."user" where id=${session.userId}`;
      }
    } finally {
      await closeApplicationDatabases();
    }
  }
});
