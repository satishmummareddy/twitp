import { readFile, readdir } from "fs/promises";
import { join } from "path";

export interface TranscriptMetadata {
  guest: string;
  title: string;
  youtube_url?: string;
  video_id?: string;
  description?: string;
  duration_seconds?: number;
  duration?: string;
  view_count?: number;
  channel?: string;
  keywords?: string[];
}

export interface ParsedTranscript {
  metadata: TranscriptMetadata;
  transcript: string;
  folderName: string;
}

/**
 * Parse a transcript markdown file with YAML frontmatter.
 * Format: --- YAML --- content
 */
export function parseTranscriptFile(
  content: string,
  folderName: string
): ParsedTranscript {
  const parts = content.split("---");
  if (parts.length < 3) {
    throw new Error(`Invalid transcript format in ${folderName}: no frontmatter found`);
  }

  const yamlStr = parts[1];
  const transcript = parts.slice(2).join("---").trim();

  const raw = parseSimpleYaml(yamlStr);

  const str = (key: string): string | undefined => {
    const v = raw[key];
    return typeof v === "string" ? v : undefined;
  };
  const strArr = (key: string): string[] | undefined => {
    const v = raw[key];
    return Array.isArray(v) ? v : undefined;
  };

  const durationStr = str("duration_seconds");
  const viewCountStr = str("view_count");

  return {
    metadata: {
      guest: str("guest") || folderName,
      title: str("title") || "",
      youtube_url: str("youtube_url"),
      video_id: str("video_id"),
      description: cleanDescription(str("description")),
      duration_seconds: durationStr ? parseFloat(durationStr) : undefined,
      duration: str("duration"),
      view_count: viewCountStr ? parseInt(viewCountStr, 10) : undefined,
      channel: str("channel"),
      keywords: strArr("keywords"),
    },
    transcript,
    folderName,
  };
}

/**
 * Simple YAML parser for transcript frontmatter.
 * Handles basic key: value pairs and arrays.
 */
function parseSimpleYaml(yaml: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  const lines = yaml.split("\n");
  let currentKey = "";
  let currentArray: string[] | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Array item
    if (trimmed.startsWith("- ") && currentKey) {
      if (!currentArray) {
        currentArray = [];
      }
      currentArray.push(trimmed.slice(2).trim());
      result[currentKey] = currentArray;
      continue;
    }

    // Key: value pair
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx > 0) {
      // Save previous array if any
      currentArray = null;

      const key = trimmed.slice(0, colonIdx).trim();
      let value = trimmed.slice(colonIdx + 1).trim();

      // Remove surrounding quotes
      if (
        (value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('"') && value.endsWith('"'))
      ) {
        value = value.slice(1, -1);
      }

      currentKey = key;
      if (value) {
        result[key] = value;
      }
    }
  }

  return result;
}

function cleanDescription(desc: string | undefined): string | undefined {
  if (!desc) return undefined;
  return desc.replace(/^\s*['"]?\s*/, "").replace(/\s*['"]?\s*$/, "");
}

/**
 * Read all transcript files from a directory.
 * Expected structure: basePath/{guest-name}/transcript.md
 */
export async function readTranscriptsFromDirectory(
  basePath: string
): Promise<ParsedTranscript[]> {
  const entries = await readdir(basePath, { withFileTypes: true });
  const transcripts: ParsedTranscript[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const transcriptPath = join(basePath, entry.name, "transcript.md");
    try {
      const content = await readFile(transcriptPath, "utf-8");
      const parsed = parseTranscriptFile(content, entry.name);
      transcripts.push(parsed);
    } catch {
      console.warn(`Skipping ${entry.name}: no transcript.md found`);
    }
  }

  return transcripts;
}

/**
 * Generate a URL-friendly slug from a string.
 */
export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
