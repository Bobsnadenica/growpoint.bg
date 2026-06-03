import Lottie from "lottie-react";
import animationData from "../../assets/company-employees.json";

export default function HeroAnimation() {
  return (
    <Lottie
      animationData={animationData}
      loop
      autoplay
      rendererSettings={{ preserveAspectRatio: "xMidYMid meet" }}
    />
  );
}
