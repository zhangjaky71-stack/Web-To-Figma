import type { WtfPackageResult } from "@w2f/wtf-packager";
import { assertProfileRequiredPixelGroundTruth } from "./pixel-ground-truth-contract.js";
import {
  buildWtfPackage,
  type WtfPackageEvidence,
} from "./wtf-package-builder.js";

export async function buildProfileCompliantWtfPackage(
  evidence: WtfPackageEvidence,
): Promise<WtfPackageResult> {
  assertProfileRequiredPixelGroundTruth(evidence.snapshot, evidence.pixel);
  return buildWtfPackage(evidence);
}
