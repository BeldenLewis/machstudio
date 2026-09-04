import { NextResponse } from "next/server";
import { getAdFolderAccess } from "@/lib/ad-folder-access";
import { decryptMetaToken, metaGraph } from "@/lib/meta-ads";
import { findMetaConnection } from "@/lib/meta-connection";

type Context = { params: Promise<{ folderId: string }> };
type Account = { id: string; name: string; currency?: string; timezone_name?: string; account_status?: number };

export async function GET(_request: Request, context: Context) {
  const { folderId } = await context.params;
  const access = await getAdFolderAccess(folderId);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const connection = await findMetaConnection(access.folder.projectId, access.user.id);
  if (!connection) return NextResponse.json({ connected: false, accounts: [] });
  try {
    const result = await metaGraph<{ data: Account[] }>("me/adaccounts", decryptMetaToken(connection.encryptedAccessToken), {
      fields: "id,name,currency,timezone_name,account_status", limit: "100",
    });
    return NextResponse.json({ connected: true, accounts: result.data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Meta 광고 계정을 불러오지 못했습니다." }, { status: 502 });
  }
}
