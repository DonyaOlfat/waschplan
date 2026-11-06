const MAX_SLUG_NUMBER = 50;

export function slugifyHouseName(name) {
  return name
    .trim()
    .toLowerCase()
    .replaceAll('ß', 'ss')
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('strasse', 'str')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function allocateSlug(tx, name) {
  const base = slugifyHouseName(name);

  if (base === '') {
    return '';
  }

  for (let number = 1; number <= MAX_SLUG_NUMBER; number += 1) {
    const slug = number === 1 ? base : `${base}-${number}`;
    const existing = await tx.house.findUnique({ where: { slug } });

    if (!existing) {
      return slug;
    }
  }

  throw new Error('Could not allocate a slug.');
}
