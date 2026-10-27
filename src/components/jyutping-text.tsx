"use client";

import { useId, useMemo, useRef, useState } from "react";
import { annotateJyutping } from "@/lib/jyutping";

export default function JyutpingText({ text }: { text: string }) {
  const tokens = useMemo(() => annotateJyutping(text), [text]);
  const [selected, setSelected] = useState<(typeof tokens)[number] | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  return <div className="jyutping-learning" lang="zh-HK">
    <p className="jyutping-text" aria-label="粤语文本与粤拼">
      {tokens.map((token, index) => token.isHan ? <button
        key={index}
        type="button"
        className="jyutping-character"
        aria-label={`${token.character}，${token.jyutping ?? "暂无粤拼"}，查看读音`}
        aria-haspopup="dialog"
        onClick={() => { setSelected(token); dialog.current?.showModal(); }}
      ><ruby>{token.character}<rp>（</rp><rt>{token.jyutping ?? "—"}</rt><rp>）</rp></ruby></button> : <span key={index}>{token.character}</span>)}
    </p>
    <dialog ref={dialog} className="character-dialog" aria-labelledby={titleId}>
      <form method="dialog"><button className="dialog-close" aria-label="关闭读音详情">×</button></form>
      <h3 id={titleId}>{selected?.character}</h3>
      <p>粤拼 <strong>{selected?.jyutping ?? "词库暂未收录"}</strong></p>
      <small>数字 1–6 表示粤语声调。自动注音请结合上下文核对。</small>
      <p className="character-next">普通话拼音、释义及发音将在后续阶段接入。</p>
    </dialog>
  </div>;
}
