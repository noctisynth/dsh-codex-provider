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
    context_window: Option<u32>,
    input_modalities: Option<Vec<String>>,
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
    pub context_window: Option<u32>,
    pub input_modalities: Option<Vec<String>>,
    pub reasoning: Option<Reasoning>,
}

pub(crate) fn parse_catalog(json: &[u8]) -> Result<Vec<Model>, Error> {
    let catalog: Catalog = serde_json::from_slice(json).map_err(Error::Catalog)?;
    Ok(catalog
        .models
        .into_iter()
        .filter(|model| model.visibility == "list")
        .map(|mut model| {
            // Ultra requires Codex multi-agent orchestration, not a Responses effort.
            model
                .supported_reasoning_levels
                .retain(|effort| effort.id != "ultra");
            Model {
                id: model.slug,
                name: model.display_name,
                context_window: model.context_window,
                input_modalities: model.input_modalities,
                reasoning: if model.supported_reasoning_levels.is_empty() {
                    None
                } else {
                    Some(Reasoning {
                        efforts: model.supported_reasoning_levels,
                        default_effort: model
                            .default_reasoning_level
                            .filter(|effort| effort != "ultra"),
                    })
                },
            }
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::{Model, parse_catalog};

    #[test]
    fn visible_models_keep_server_order_and_context_capacity() -> Result<(), crate::error::Error> {
        let models = parse_catalog(
            br#"{"models":[
            {"slug":"second","display_name":"Second","visibility":"list","context_window":272000,"max_context_window":872000,"input_modalities":["text","image"]},
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
                    context_window: Some(272000),
                    input_modalities: Some(vec!["text".into(), "image".into()]),
                    reasoning: None,
                },
                Model {
                    id: "first".into(),
                    name: "First".into(),
                    context_window: None,
                    input_modalities: None,
                    reasoning: None,
                },
            ]
        );
        Ok(())
    }

    #[test]
    fn reasoning_levels_exclude_ultra_and_preserve_other_values() -> Result<(), crate::error::Error>
    {
        let models = parse_catalog(
            br#"{"models":[{
            "slug":"test","display_name":"Test","visibility":"list",
            "default_reasoning_level":"low",
            "supported_reasoning_levels":[
                {"effort":"low","description":"Lighter reasoning"},
                {"effort":"ultra","description":"Codex multi-agent orchestration"},
                {"effort":"future-level","description":"Provider-defined effort"},
                {"effort":"max","description":"Maximum reasoning"}
            ]
        },{
            "slug":"ultra-default","display_name":"Ultra default","visibility":"list",
            "default_reasoning_level":"ultra",
            "supported_reasoning_levels":[{"effort":"ultra"},{"effort":"high"}]
        },{
            "slug":"ultra-only","display_name":"Ultra only","visibility":"list",
            "default_reasoning_level":"ultra",
            "supported_reasoning_levels":[{"effort":"ultra"}]
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
            ["low", "future-level", "max"]
        );
        assert_eq!(
            reasoning.efforts[1].description.as_deref(),
            Some("Provider-defined effort")
        );
        let ultra_default = models[1]
            .reasoning
            .as_ref()
            .ok_or(crate::error::Error::Protocol("Missing test reasoning"))?;
        assert_eq!(ultra_default.default_effort, None);
        assert_eq!(
            ultra_default
                .efforts
                .iter()
                .map(|effort| effort.id.as_str())
                .collect::<Vec<_>>(),
            ["high"]
        );
        assert_eq!(models[2].reasoning, None);
        Ok(())
    }

    #[test]
    fn standard_api_catalog_is_not_a_subscription_catalog() {
        assert!(parse_catalog(br#"{"data":[]}"#).is_err());
    }
}
