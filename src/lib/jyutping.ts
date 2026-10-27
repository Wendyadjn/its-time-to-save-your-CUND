import { getJyutpingList } from "to-jyutping";

export function annotateJyutping(text: string) {
  // shortcut: 自动词典注音仍可能误判多音字，专业学习场景需增加人工校读。
  return getJyutpingList(text).map(([character, jyutping]) => ({
    character,
    jyutping,
    isHan: /\p{Script=Han}/u.test(character),
  }));
}
