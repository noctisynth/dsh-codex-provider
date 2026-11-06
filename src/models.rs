use serde::Deserialize;

use crate::error::Error;

#[derive(Deserialize)]
struct Catalog {
    models: Vec<CatalogModel>,
}

#[derive(Deserialize)]
struct CatalogModel {
    slug: String,
    display_name: String,
    visibility: String,
    #[serde(default)]
    supported_reasoning_levels: Vec<ReasoningEffort>,
    default_reasoning_level: Option<String>,
}

#[derive(Debug, Deserialize, PartialEq)]
pub(crate) struct ReasoningEffort {
    #[serde(rename = "effort")]
    pub id: String,
    pub description: Option<String>,
}

#[derive(Debug, PartialEq)]
pub(crate) struct Reasoning {
    pub efforts: Vec<ReasoningEffort>,
    pub default_effort: Option<String>,
}

#[derive(Debug, PartialEq)]
pub(crate) struct Model {
    pub id: String,
    pub name: String,
    pub reasoning: Option<Reasoning>,
}

pub(crate) fn parse_catalog(json: &[u8]) -> Result<Vec<Model>, Error> {
    let catalog: Catalog = serde_json::from_slice(json).map_err(Error::Catalog)?;
    Ok(catalog
        .models
        .into_iter()
        .filter(|model| model.visibility == "list")
        .map(|model| Model {
            id: model.slug,
            name: model.display_name,
            reasoning: if model.supported_reasoning_levels.is_empty() {
                None
            } else {
                Some(Reasoning {
                    efforts: model.supported_reasoning_levels,
                    default_effort: model.default_reasoning_level,
                })
            },
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::{Model, parse_catalog};

    #[test]
    fn visible_models_keep_server_order() -> Result<(), crate::error::Error> {
        let models = parse_catalog(
            br#"{"models":[
            {"slug":"second","display_name":"Second","visibility":"list"},
            {"slug":"hidden","display_name":"Hidden","visibility":"hidden"},
            {"slug":"first","display_name":"First","visibility":"list"}
        ]}"#,
        )?;
        assert_eq!(
            models,
            vec![
                Model {
                    id: "second".into(),
                    name: "Second".into(),
                    reasoning: None,
                },
                Model {
                    id: "first".into(),
                    name: "First".into(),
                    reasoning: None,
                },
            ]
        );
        Ok(())
    }

    #[test]
    fn reasoning_levels_preserve_server_values_order_and_default() -> Result<(), crate::error::Error>
    {
        let models = parse_catalog(
            br#"{"models":[{
            "slug":"test","display_name":"Test","visibility":"list",
            "default_reasoning_level":"low",
            "supported_reasoning_levels":[
                {"effort":"low","description":"Lighter reasoning"},
                {"effort":"future-level","description":"Provider-defined effort"}
            ]
        }]}"#,
        )?;
        let reasoning = models[0]
            .reasoning
            .as_ref()
            .ok_or(crate::error::Error::Protocol("Missing test reasoning"))?;
        assert_eq!(reasoning.default_effort.as_deref(), Some("low"));
        assert_eq!(
            reasoning
                .efforts
                .iter()
                .map(|effort| effort.id.as_str())
                .collect::<Vec<_>>(),
            ["low", "future-level"]
        );
        assert_eq!(
            reasoning.efforts[1].description.as_deref(),
            Some("Provider-defined effort")
        );
        Ok(())
    }

    #[test]
    fn standard_api_catalog_is_not_a_subscription_catalog() {
        assert!(parse_catalog(br#"{"data":[]}"#).is_err());
    }
}
