import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "敢学粤语 · Olivia Cantorigo",
  description: "粤普双向翻译、粤拼学习与语音转译工具",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
