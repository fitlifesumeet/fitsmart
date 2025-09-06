
import "../styles/globals.css";
import type { AppProps } from "next/app";

export default function App({ Component, pageProps }: AppProps) {
  return (

    <div className="min-h-screen bg-cover bg-center" style={{ backgroundImage: "url('/images/bg-photo.jpeg')" }}>
  <div className="min-h-screen bg-black/40 p-4 md:p-8">
    <Component {...pageProps} />
  </div>
</div>
  );
}
