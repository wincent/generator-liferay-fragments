const voca = require('voca');

const {
  COLLECTION_DESCRIPTION_DEFAULT,
  COLLECTION_DESCRIPTION_MESSAGE,
  COLLECTION_DESCRIPTION_VAR,
  COLLECTION_NAME_MESSAGE,
  COLLECTION_NAME_NON_EMPTY_ERROR_MESSAGE,
  COLLECTION_NAME_VAR,
  COLLECTION_SLUG_VAR,
  FRAGMENT_COLLECTION_SLUG_VAR,
  FRAGMENT_COMPOSITION_NAME_VAR,
  FRAGMENT_NAME_VAR,
  FRAGMENT_TYPE_VAR,
  MIN_LIFERAY_VERSION_SAMPLE,
  MIN_LIFERAY_VERSION_VAR,
} = require('../utils/constants');
const { default: CustomGenerator } = require('../utils/custom-generator');

module.exports = class extends CustomGenerator {
  /**
   * @inheritdoc
   */
  async prompting() {
    await this.ask([
      {
        type: 'input',
        name: COLLECTION_NAME_VAR,
        message: COLLECTION_NAME_MESSAGE,
        validate: (name) =>
          name ? true : COLLECTION_NAME_NON_EMPTY_ERROR_MESSAGE,
        when: !this.hasValue(COLLECTION_NAME_VAR),
      },
      {
        type: 'input',
        name: COLLECTION_DESCRIPTION_VAR,
        message: COLLECTION_DESCRIPTION_MESSAGE,
        when: !this.hasValue(COLLECTION_DESCRIPTION_VAR),
      },
    ]);

    this.setValue(COLLECTION_DESCRIPTION_VAR, COLLECTION_DESCRIPTION_DEFAULT);

    this.setValue(
      COLLECTION_SLUG_VAR,
      voca.slugify(this.getValue(COLLECTION_NAME_VAR))
    );

    this.throwRequiredError(COLLECTION_SLUG_VAR);
  }

  /**
   * @inheritdoc
   */
  writing() {
    this.copyTemplates(`src/${this.getValue(COLLECTION_SLUG_VAR)}`, [
      'collection.json',
    ]);
  }

  /**
   * @inheritdoc
   */
  end() {
    const fragmentName = this.getValue(FRAGMENT_NAME_VAR);
    const minLiferayVersion = this.getValue(MIN_LIFERAY_VERSION_VAR);
    const fragmentCompositionName = this.getValue(
      FRAGMENT_COMPOSITION_NAME_VAR
    );

    if (fragmentName) {
      this.composeWith(require.resolve('../fragment'), {
        [FRAGMENT_NAME_VAR]: fragmentName,
        [FRAGMENT_TYPE_VAR]: this.getValue(FRAGMENT_TYPE_VAR),
        [FRAGMENT_COLLECTION_SLUG_VAR]: this.getValue(COLLECTION_SLUG_VAR),
        [MIN_LIFERAY_VERSION_VAR]:
          minLiferayVersion || MIN_LIFERAY_VERSION_SAMPLE,
      });
    }

    if (fragmentCompositionName) {
      this.composeWith(require.resolve('../fragment-composition'), {
        [FRAGMENT_COMPOSITION_NAME_VAR]: fragmentCompositionName,
        [FRAGMENT_COLLECTION_SLUG_VAR]: this.getValue(COLLECTION_SLUG_VAR),
      });
    }
  }
};
