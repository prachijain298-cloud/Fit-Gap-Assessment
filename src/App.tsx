import assessmentSource from "./imports/Process-Fit-Assessment__1_.html?raw";
import enterpriseStyles from "./enterprise.css?raw";

const applicationDocument = assessmentSource.replace(
  "</head>",
  `<style>${enterpriseStyles}</style></head>`,
);

export default function App() {
  return (
    <iframe
      className="application-frame"
      srcDoc={applicationDocument}
      title="Process Fit Assessment"
      sandbox="allow-downloads allow-forms allow-modals allow-same-origin allow-scripts"
    />
  );
}
