const parseIntegrationData = (integration) => {
    if (!integration || integration.integration_data == null) {
        return {};
    }

    if (typeof integration.integration_data === 'string') {
        try {
            return JSON.parse(integration.integration_data);
        } catch {
            return {};
        }
    }

    return integration.integration_data || {};
};

const withParsedIntegrationData = (integration) => {
    if (!integration) return integration;

    return {
        ...integration,
        integration_data: parseIntegrationData(integration),
    };
};

module.exports = {
    parseIntegrationData,
    withParsedIntegrationData,
};
