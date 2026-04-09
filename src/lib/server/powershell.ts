import "server-only";

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type DirectoryLinkInfo = {
  name: string;
  fullName: string;
  linkType: string | null;
  target: string[];
};

export async function listLinkedDirectories(targetPath: string) {
  const script = `
    $items = Get-ChildItem -LiteralPath '${escapePs(targetPath)}' -Force -ErrorAction Stop |
      Where-Object { $_.PSIsContainer } |
      ForEach-Object {
        [pscustomobject]@{
          name = $_.Name
          fullName = $_.FullName
          linkType = if ($_.LinkType) { $_.LinkType } else { $null }
          target = if ($_.Target) {
            if ($_.Target -is [System.Array]) { @($_.Target) } else { @($_.Target) }
          } else {
            @()
          }
        }
      }
    @($items) | ConvertTo-Json -Depth 4 -Compress
  `;

  const output = await runPowerShell(script);
  if (!output.trim()) {
    return [] satisfies DirectoryLinkInfo[];
  }

  const parsed = JSON.parse(output) as
    | (Omit<DirectoryLinkInfo, "target"> & { target: string[] | string | null })
    | Array<Omit<DirectoryLinkInfo, "target"> & { target: string[] | string | null }>;

  const records = Array.isArray(parsed) ? parsed : [parsed];
  return records.map((record) => ({
    ...record,
    target: Array.isArray(record.target)
      ? record.target.filter(Boolean)
      : typeof record.target === "string" && record.target
        ? [record.target]
        : [],
  }));
}

export async function openInExplorer(targetPath: string) {
  const script = `
    Start-Process explorer.exe '${escapePs(targetPath)}'
  `;
  await runPowerShell(script);
}

async function runPowerShell(script: string) {
  const { stdout } = await execFileAsync(
    "powershell",
    ["-NoProfile", "-Command", script],
    { windowsHide: true, maxBuffer: 1024 * 1024 * 8 },
  );

  return stdout;
}

function escapePs(value: string) {
  return value.replace(/'/g, "''");
}
