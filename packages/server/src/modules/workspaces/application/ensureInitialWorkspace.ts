export interface InitialWorkspaceProvisioner {
  provision(ownerUserId: number): Promise<unknown>;
}

export async function ensureInitialWorkspace(
  ownerUserId: number,
  provisioner: InitialWorkspaceProvisioner,
) {
  return provisioner.provision(ownerUserId);
}
