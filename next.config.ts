import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // バナーの縮小・JPEG変換（sharp）用。libvips の共有ライブラリはファイル追跡から漏れることがあるため明示的に含める
  // （2026-11-05、libvips-cpp.so を読み込めずバナー生成が全滅した）
  outputFileTracingIncludes: {
    "/api/banner/**/*": [
      "./node_modules/@img/sharp-linux-x64/**/*",
      "./node_modules/@img/sharp-libvips-linux-x64/**/*",
    ],
  },
};

export default nextConfig;
