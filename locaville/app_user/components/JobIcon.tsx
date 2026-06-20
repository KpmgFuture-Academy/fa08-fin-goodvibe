"use client";

/** 작업/활동을 나타내는 라인 아이콘 (이모지 대체). job_cd 우선, 없으면 이름 키워드 매칭. */

import { Droplets, Waves, Sprout, FlaskConical, GraduationCap, Tractor, ShieldCheck, Search, Leaf, type LucideIcon } from "lucide-react";

const BY_JOB: Record<string, LucideIcon> = {
  LCP_AWD: Droplets,
  LCP_DRAIN: Waves,
  LCP_BIOCHAR: Sprout,
  LCP_FERT: FlaskConical,
  LCP_EDU: GraduationCap,
  LCP_PLOW: Tractor,
};

const BY_KEYWORD: { kw: string; Icon: LucideIcon }[] = [
  { kw: "물떼기", Icon: Droplets },
  { kw: "물", Icon: Droplets },
  { kw: "관개", Icon: Droplets },
  { kw: "바이오차", Icon: Sprout },
  { kw: "비료", Icon: Sprout },
  { kw: "퇴비", Icon: Sprout },
  { kw: "방제", Icon: ShieldCheck },
  { kw: "농약", Icon: ShieldCheck },
  { kw: "수확", Icon: Leaf },
  { kw: "이앙", Icon: Sprout },
  { kw: "파종", Icon: Sprout },
  { kw: "교육", Icon: GraduationCap },
  { kw: "점검", Icon: Search },
  { kw: "갈이", Icon: Tractor },
];

export function jobIconFor(opts: { jobCd?: string; name?: string }): LucideIcon {
  if (opts.jobCd && BY_JOB[opts.jobCd]) return BY_JOB[opts.jobCd];
  if (opts.name) {
    const hit = BY_KEYWORD.find((k) => opts.name!.includes(k.kw));
    if (hit) return hit.Icon;
  }
  return Leaf;
}

export function JobIcon({ jobCd, name, size = 24, className }: { jobCd?: string; name?: string; size?: number; className?: string }) {
  const Icon = jobIconFor({ jobCd, name });
  return <Icon size={size} className={className} />;
}
