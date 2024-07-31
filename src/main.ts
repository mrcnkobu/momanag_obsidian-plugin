import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, moment } from 'obsidian';

interface MyPluginSettings {
    storageFolder: string;
    accounts: string[];
    categories: string[];
}

const DEFAULT_SETTINGS: MyPluginSettings = {
    storageFolder: 'expenses',
    accounts: ['Cash', 'Bank', 'Credit Card'],
    categories: ['Uncategorized'],
}

export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;

    async onload() {
        console.log('Loading My Plugin');

        await this.loadSettings();

        this.addCommands();
        this.addSettingTab(new MyPluginSettingTab(this.app, this));
    }

    addCommands() {
        this.addCommand({
            id: 'add-expense',
            name: 'Add Expense',
            callback: () => this.addTransaction('expense'),
        });

        this.addCommand({
            id: 'add-income',
            name: 'Add Income',
            callback: () => this.addTransaction('income'),
        });

        this.addCommand({
            id: 'create-report',
            name: 'Create Report',
            callback: () => this.createReport(),
        });
    }

    async addTransaction(type: 'expense' | 'income') {
        const modal = new TransactionModal(this.app, type, this.settings.accounts, this.settings.categories);
        const result = await modal.open();
        if (result) {
            const { amount, description, account, category } = result;
            const now = new Date();
            const year = now.getFullYear().toString();
            const month = (now.getMonth() + 1).toString().padStart(2, '0');
            const day = now.getDate().toString().padStart(2, '0');
            const timestamp = now.toISOString().split('T')[0] + '-' + now.toTimeString().split(' ')[0].replace(/:/g, '-');
            const filename = `${timestamp}_${type}.md`;
            const folderPath = `${this.settings.storageFolder}/${year}/${year}-${month}/${year}-${month}-${day}`;
            const filePath = `${folderPath}/${filename}`;
            const content = `## ${type.charAt(0).toUpperCase() + type.slice(1)}\n\n- Amount: ${type === 'expense' ? '-' : ''}${amount}\n- Description: ${description}\n- Account: ${account}\n- Category: ${category}`;

            try {
                // Ensure folder exists
                await this.ensureFolderExists(folderPath);

                // Create and write to the file
                await this.app.vault.create(filePath, content);
                new Notice(`${type.charAt(0).toUpperCase() + type.slice(1)} added successfully!`);
                console.log(`File created: ${filePath}`);
            } catch (error) {
                console.error(`Error writing file: ${error}`);
                new Notice(`Error: Failed to add ${type}. Check console for details.`);
            }
        }
    }



    async createReport() {
        console.log('Creating report...');
        const modal = new ReportModal(this.app);
        const result = await modal.openModal();
        console.log(`Report modal result: ${JSON.stringify(result)}`);
        if (result) {
            const { startDate, endDate } = result;
            const folderPath = this.settings.storageFolder;
            const startDateObj = new Date(startDate);
            const endDateObj = new Date(endDate);

            const transactions = await this.getTransactionsInRange(folderPath, startDateObj, endDateObj);

            console.log(`Transactions found: ${JSON.stringify(transactions)}`);
            const report = this.generateReport(transactions);
            const reportFilename = `${folderPath}/report_${startDate}_${endDate}.md`;
            try {
                await this.app.vault.create(reportFilename, report);
                new Notice(`Report created successfully: ${reportFilename}`);
                console.log(`Report created: ${reportFilename}`);
            } catch (error) {
                console.error(`Error creating report: ${error}`);
                new Notice(`Error: Failed to create report. Check console for details.`);
            }
        }
    }

    async getTransactionsInRange(folderPath: string, startDate: Date, endDate: Date) {
        const transactions = [];
        const files = await this.app.vault.getMarkdownFiles();
        console.log(`Files in vault: ${files.map(file => file.path)}`);

        for (const file of files) {
            if (file.path.startsWith(folderPath)) {
                const parts = file.path.replace(`${folderPath}/`, '').split('/');
                if (parts.length === 4) {
                    const dateStr = parts[3].split('_')[0];
                    const date = moment(dateStr, "YYYY-MM-DD-HH-mm-ss").toDate();
                    console.log(`Parsed date for file ${file.path}: ${date}`);

                    if (date >= startDate && date <= endDate) {
                        console.log(`File ${file.path} is within date range`);
                        const content = await this.app.vault.read(file);
                        const transaction = this.parseTransaction(content);
                        if (transaction) {
                            transaction.date = date;
                            transaction.filename = file.path.replace(`${folderPath}/`, '');
                            transactions.push(transaction);
                        } else {
                            console.log(`Failed to parse transaction for file ${file.path}`);
                        }
                    } else {
                        console.log(`File ${file.path} is outside date range`);
                    }
                }
            }
        }

        return transactions;
    }

    parseTransaction(content: string) {
        console.log(`Parsing content: ${content}`);
        const lines = content.split('\n');
        const typeLine = lines.find(line => line.startsWith('## '));
        const amountLine = lines.find(line => line.startsWith('- Amount:'));
        const descriptionLine = lines.find(line => line.startsWith('- Description:'));
        const accountLine = lines.find(line => line.startsWith('- Account:'));
        const categoryLine = lines.find(line => line.startsWith('- Category:'));

        if (typeLine && amountLine && descriptionLine && accountLine && categoryLine) {
            const type = typeLine.replace('## ', '').toLowerCase();
            const amount = parseFloat(amountLine.replace('- Amount: ', ''));
            const description = descriptionLine.replace('- Description: ', '');
            const account = accountLine.replace('- Account: ', '');
            const category = categoryLine.replace('- Category: ', '');
            console.log(`Parsed transaction: { type: ${type}, amount: ${amount}, description: ${description}, account: ${account}, category: ${category} }`);
            return { type, amount, description, account, category };
        }
        return null;
    }

    generateReport(transactions: any[]) {
        const report: string[] = [];

        this.settings.accounts.forEach(account => {
            const accountTransactions = transactions.filter(tx => tx.account === account);
            if (accountTransactions.length > 0) {
                report.push(`## Account: ${account}`);
                report.push(`| Date | Description | Category | Income | Expense | Link |`);
                report.push(`|------|-------------|----------|--------|---------|------|`);

                let totalIncome = 0;
                let totalExpense = 0;

                accountTransactions.forEach(tx => {
                    const date = moment(tx.date).format('YYYY-MM-DD');
                    const description = tx.description;
                    const category = tx.category;
                    const income = tx.type === 'income' ? tx.amount : '';
                    const expense = tx.type === 'expense' ? -tx.amount : '';
                    const link = `[[${tx.filename}]]`;

                    if (tx.type === 'income') {
                        totalIncome += tx.amount;
                    } else if (tx.type === 'expense') {
                        totalExpense += tx.amount;
                    }

                    report.push(`| ${date} | ${description} | ${category} | ${income} | ${expense} | ${link} |`);
                });

                report.push(`|      |             | Total    | ${totalIncome} | ${totalExpense} |      |`);
            }
        });

        return report.join('\n');
    }

    async ensureFolderExists(folderPath: string) {
        const parts = folderPath.split('/');
        for (let i = 1; i <= parts.length; i++) {
            const subPath = parts.slice(0, i).join('/');
            try {
                await this.app.vault.createFolder(subPath);
            } catch (error) {
                // Folder already exists
            }
        }
    }

    onunload() {
        console.log('Unloading My Plugin');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class TransactionModal extends Modal {
    type: 'expense' | 'income';
    accounts: string[];
    categories: string[];
    result: any = {};

    constructor(app: App, type: 'expense' | 'income', accounts: string[], categories: string[]) {
        super(app);
        this.type = type;
        this.accounts = accounts;
        this.categories = categories;
    }

    onOpen() {
        let { contentEl } = this;
        contentEl.createEl('h2', { text: `Add ${this.type.charAt(0).toUpperCase() + this.type.slice(1)}` });

        const form = contentEl.createEl('form');

        const amountInput = form.createEl('input', { type: 'number', placeholder: 'Amount', required: true });
        amountInput.classList.add('modal-input');
        amountInput.focus();

        const descriptionInput = form.createEl('input', { type: 'text', placeholder: 'Description', required: true });
        descriptionInput.classList.add('modal-input');

        const accountSelect = form.createEl('select');
        this.accounts.forEach(account => {
            accountSelect.createEl('option', { text: account });
        });
        accountSelect.classList.add('modal-input');

        const categorySelect = form.createEl('select');
        this.categories.forEach(category => {
            categorySelect.createEl('option', { text: category });
        });
        categorySelect.classList.add('modal-input');

        const submitButton = form.createEl('button', { text: 'Add', type: 'submit' });
        submitButton.classList.add('mod-cta');
        submitButton.addEventListener('click', async (evt) => {
            evt.preventDefault();
            this.result.amount = amountInput.value.trim();
            this.result.description = descriptionInput.value.trim();
            this.result.account = accountSelect.value;
            this.result.category = categorySelect.value;
            this.close();
        });
    }

    onClose() {
        let { contentEl } = this;
        contentEl.empty();
    }

    async open(): Promise<any> {
        return new Promise((resolve) => {
            super.open();
            this.onClose = () => resolve(this.result);
        });
    }
}

class ReportModal extends Modal {
    result: any;

    constructor(app: App) {
        super(app);
        this.result = null;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl('h2', { text: 'Create Report' });

        const startDateInput = contentEl.createEl('input', { type: 'date', placeholder: 'Start Date' });
        const endDateInput = contentEl.createEl('input', { type: 'date', placeholder: 'End Date' });

        const createButton = contentEl.createEl('button', { text: 'Create' });
        createButton.onclick = () => {
            const startDate = startDateInput.value;
            const endDate = endDateInput.value;
            if (startDate && endDate) {
                this.result = { startDate, endDate };
                this.close();
            } else {
                new Notice('Please select both start and end dates');
            }
        };
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }

    async openModal(): Promise<any> {
        return new Promise(resolve => {
            this.onClose = () => {
                super.onClose();
                resolve(this.result);
            };
            this.open();
        });
    }
}

class MyPluginSettingTab extends PluginSettingTab {
    plugin: MyPlugin;

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        containerEl.createEl('h2', { text: 'Settings for My Plugin' });

        new Setting(containerEl)
            .setName('Storage Folder')
            .setDesc('Folder to store expense and income files')
            .addText(text => text
                .setPlaceholder('expenses')
                .setValue(this.plugin.settings.storageFolder)
                .onChange(async (value) => {
                    this.plugin.settings.storageFolder = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Accounts')
            .setDesc('List of accounts')
            .addTextArea(text => text
                .setPlaceholder('Cash\nBank\nCredit Card')
                .setValue(this.plugin.settings.accounts.join('\n'))
                .onChange(async (value) => {
                    this.plugin.settings.accounts = value.split('\n').map(account => account.trim());
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Categories')
            .setDesc('List of categories')
            .addTextArea(text => text
                .setPlaceholder('Uncategorized')
                .setValue(this.plugin.settings.categories.join('\n'))
                .onChange(async (value) => {
                    this.plugin.settings.categories = value.split('\n').map(category => category.trim());
                    await this.plugin.saveSettings();
                }));
    }
}
