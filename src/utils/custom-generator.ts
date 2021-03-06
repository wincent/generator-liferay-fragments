import fs from 'fs';
import path from 'path';
import Generator from 'yeoman-generator';
import { IAnswerGroup, IQuestion } from 'yeoman-generator-types';

/**
 * Custom Generator that extends Yeoman's Generator class
 * adding extra shortcuts.
 *
 * It maintains a three objects with the information collected from users:
 * - this.options: Given by yeoman, console parameters
 * - this.defaultValues: Initially empty, may be overriden with setValue method,
 *   values used if there is no answer and no option has been given.
 * - this.answers: Initially empty, it is filled with the answers given
 *   by asking questions.
 *
 * @see Generator
 */
export default class CustomGenerator extends Generator {
  defaultValues: IAnswerGroup = {};
  answers: IAnswerGroup = {};
  options: IAnswerGroup;

  constructor(args: any, options: any) {
    super(args, options);

    this.defaultValues = {};
    this.answers = {};

    // @ts-ignore

    if (!this.options) {
      this.options = {};
    }
  }

  async ask(question: IQuestion | IQuestion[]): Promise<IAnswerGroup> {
    const answers = await this.prompt(question);
    this.answers = { ...this.answers, ...answers };

    return this.answers;
  }

  copyFile(filePath: string, destinationPath: string): void {
    this.fs.copy(
      this.templatePath(filePath),
      this.destinationPath(destinationPath)
    );
  }

  copyFiles(basePath: string, filePaths: string[]): void {
    filePaths.forEach((filePath) =>
      this.copyFile(filePath, path.join(basePath, filePath))
    );
  }

  copyTemplate(templatePath: string, destinationPath: string): void {
    this.fs.copyTpl(
      this.templatePath(templatePath),
      this.destinationPath(destinationPath),
      {
        pkg: JSON.parse(
          fs.readFileSync(
            path.join(__dirname, '..', '..', 'package.json'),
            'utf-8'
          )
        ),

        ...this.defaultValues,
        ...this.options,
        ...this.answers,
      }
    );
  }

  copyTemplates(basePath: string, templatePaths: string[]): void {
    templatePaths.forEach((templatePath) =>
      this.copyTemplate(
        `${templatePath}.ejs`,
        path.join(basePath, templatePath)
      )
    );
  }

  getValue(key: string): string | undefined {
    return (
      this.answers[key] ||
      this.options[key] ||
      this.config.get(key) ||
      this.defaultValues[key]
    );
  }

  hasValue(key: string): boolean {
    return (
      key in this.answers ||
      key in this.options ||
      Boolean(this.config.get(key)) ||
      key in this.defaultValues
    );
  }

  throwRequiredError(variable: string): void {
    const value = this.getValue(variable) || '';

    if (!value || !value.trim()) {
      this.env.error(new Error(`${variable} is required`));
    }
  }

  setValue(key: string, value: string): void {
    this.defaultValues[key] = value;
  }
}
