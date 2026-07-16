import { prisma } from './index'
import { fromPerson, fromNewsItem, fromResource, fromZone, fromWorkstation } from './serialize'
import {
  mockPersonnel, mockNews, mockResources, mockFloors,
} from '../mock-data'

async function seedIfEmpty() {
  // Person
  if ((await prisma.person.count()) === 0) {
    await prisma.person.createMany({ data: mockPersonnel.map(fromPerson) })
    console.log(`✓ seeded ${mockPersonnel.length} persons`)
  } else {
    console.log('• persons already present, skip')
  }

  // NewsItem
  if ((await prisma.newsItem.count()) === 0) {
    await prisma.newsItem.createMany({ data: mockNews.map(fromNewsItem) })
    console.log(`✓ seeded ${mockNews.length} news`)
  } else {
    console.log('• news already present, skip')
  }

  // Resource
  if ((await prisma.resource.count()) === 0) {
    await prisma.resource.createMany({ data: mockResources.map(fromResource) })
    console.log(`✓ seeded ${mockResources.length} resources`)
  } else {
    console.log('• resources already present, skip')
  }

  // Floor + Zone + Workstation
  // We use flat createMany calls because Workstation has two parent FKs
  // (zoneId + floorId), which makes deep nested create problematic.
  if ((await prisma.floor.count()) === 0) {
    // 1. Floors
    await prisma.floor.createMany({
      data: mockFloors.map(f => ({ id: f.id, name: f.name, order: f.order })),
    })
    // 2. Zones
    const allZones = mockFloors.flatMap(f => f.zones.map(fromZone))
    await prisma.zone.createMany({ data: allZones })
    // 3. Workstations
    const allWs = mockFloors.flatMap(
      f => f.zones.flatMap(z => z.workstations.map(fromWorkstation)),
    )
    await prisma.workstation.createMany({ data: allWs })

    const totalZones = mockFloors.reduce((s, f) => s + f.zones.length, 0)
    const totalWs = mockFloors.reduce(
      (s, f) => s + f.zones.reduce((s2, z) => s2 + z.workstations.length, 0),
      0,
    )
    console.log(`✓ seeded ${mockFloors.length} floors / ${totalZones} zones / ${totalWs} workstations`)
  } else {
    console.log('• floors already present, skip')
  }

  // Dev-only local login identity (provider="local"). Lets `pnpm db:seed`
  // provision an admin account for the dev login form (admin/admin). The dev
  // login route reads role from this User record rather than hardcoding it.
  // Idempotently upsert the specific local/admin record so the demo admin
  // account exists (as admin) regardless of any other local users created
  // earlier via the dev login form (which defaults new usernames to member).
  const adminUser = await prisma.user.upsert({
    where: { provider_externalId: { provider: 'local', externalId: 'admin' } },
    update: { role: 'admin' },
    create: { provider: 'local', externalId: 'admin', role: 'admin' },
  })
  console.log(`✓ ensured dev local admin user (admin, role=${adminUser.role})`)
}

seedIfEmpty()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
