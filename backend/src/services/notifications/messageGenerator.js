// The one seam an AI implementation replaces: given a notification type and its
// structured context, produce { title, message }. Delivery never depends on how.

const { renderTemplate } = require("./templates");

class TemplateMessageGenerator {
  async generate({ type, data }) {
    return renderTemplate(type, data);
  }
}

let activeGenerator = new TemplateMessageGenerator();

module.exports = {
  TemplateMessageGenerator,
  getMessageGenerator: () => activeGenerator,
  setMessageGenerator: (generator) => {
    activeGenerator = generator;
  },
};
