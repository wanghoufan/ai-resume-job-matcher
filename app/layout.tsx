import type { Metadata } from "next";
import "./globals.css";
import "./byok.css";

export const metadata: Metadata = {
  title: "AI 简历岗位匹配助手",
  description: "让每一份简历更接近理想岗位。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
