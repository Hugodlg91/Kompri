import { VideoConverter } from "./VideoConverter";
import { AudioConverter } from "./AudioConverter";
import { ImageConverter } from "./ImageConverter";

type MediaType = "image" | "video" | "audio";

export interface ExternalFilesRequest {
  files: string[];
  seq: number;
}

interface ConverterPageProps {
  type: MediaType;
  externalFiles?: ExternalFilesRequest;
}

export function ConverterPage({ type, externalFiles }: ConverterPageProps) {
  if (type === "image") return <ImageConverter externalFiles={externalFiles} />;
  if (type === "video") return <VideoConverter externalFiles={externalFiles} />;
  if (type === "audio") return <AudioConverter externalFiles={externalFiles} />;
  return null;
}
