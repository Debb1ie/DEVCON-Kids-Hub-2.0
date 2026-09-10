export const deterministicFolderName = (event) =>
  `${event.event_date || 'Date pending'} - ${event.title}`.slice(0, 240);

export async function findOrCreateEventFolder(provider, event, parentId) {
  const name = deterministicFolderName(event);
  const existing = await provider.findFolders(name, parentId);
  if (existing.length) return { folder: existing[0], created: false };
  return { folder: await provider.createFolder(name, parentId), created: true };
}

export async function upsertReportSheetRow(provider, existingReference, values) {
  if (existingReference) {
    await provider.updateRow(existingReference, values);
    return existingReference;
  }
  const reference = await provider.appendRow(values);
  if (!reference) throw new Error('Provider did not return a row reference');
  return reference;
}
