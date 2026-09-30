const REMOTE_WARNING = 'Google credential was removed locally, but remote revocation could not be confirmed.';

const assertDatabaseSuccess = (result, operation) => {
  if (result?.error) throw new Error(`Google Workspace ${operation} failed`);
};

export async function disconnectGoogleWorkspace({
  actorId,
  loadCredential,
  decryptCredential,
  revokeCredential,
  deleteCredential,
  clearConnection,
  writeAudit,
}) {
  const loaded = await loadCredential();
  assertDatabaseSuccess(loaded, 'credential lookup');

  let revocation = { confirmed: true, outcome: 'not_required', providerStatus: null, reason: null };
  if (loaded.data) {
    try {
      const token = await decryptCredential(loaded.data.refresh_token_ciphertext);
      revocation = await revokeCredential(token);
    } catch {
      revocation = { confirmed: false, outcome: 'unavailable', providerStatus: null, reason: 'revocation_unavailable' };
    }
  }

  assertDatabaseSuccess(await deleteCredential(), 'credential removal');
  assertDatabaseSuccess(await clearConnection(actorId), 'connection-state cleanup');

  try {
    await writeAudit({
      actor_id: actorId,
      action: 'DISCONNECT_GOOGLE_WORKSPACE',
      target_table: 'google_workspace_settings',
      metadata: {
        local_cleanup: 'success',
        remote_revocation: revocation.outcome,
        provider_status: revocation.providerStatus,
        provider_reason: revocation.reason,
      },
    });
  } catch {
    // Audit transport must not turn a completed local disconnect into a false failure.
  }

  return {
    connected: false,
    disconnected: true,
    revocationConfirmed: revocation.confirmed,
    ...(revocation.confirmed ? {} : { warning: REMOTE_WARNING }),
  };
}

export { REMOTE_WARNING };
