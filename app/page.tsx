import { Library } from "./library";
import { NewRemixForm } from "./new-remix-form";

export default function Home() {
  return (
    <div className="home">
      <section className="panel">
        <h1>New remix</h1>
        <p className="muted">
          Paste a hook + demo video that is already working for someone else. You get the same hook, remade for your
          product, followed by your own demo.
        </p>
        <NewRemixForm />
      </section>
      <section>
        <h2>Library</h2>
        <Library />
      </section>
    </div>
  );
}
